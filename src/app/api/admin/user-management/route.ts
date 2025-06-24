import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from '@/lib/adminAuth';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

// Fields that can be safely updated
const UPDATABLE_FIELDS = [
  'user_id',
  'auth_email',
  'address',
  'created_at',
  'migratedAt',
  'migrated'
];

// Fields that require special confirmation to delete
const CRITICAL_FIELDS = ['private_key', 'password_hash'];

// GET: Fetch user by document ID
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminToken(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const doc = await db.collection('mzs').doc(documentId).get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = {
      documentId: doc.id,
      ...doc.data()
    } as any;

    // Log admin access
    await db.collection('admin_logs').add({
      action: 'view_user',
      adminEmail: authResult.email,
      timestamp: new Date().toISOString(),
      details: { documentId, userId: userData.user_id }
    });

    return NextResponse.json({ user: userData });

  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Update user fields
export async function PUT(request: NextRequest) {
  const authResult = await verifyAdminToken(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { documentId, updates, adminNote } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updates object is required' }, { status: 400 });
    }

    // Validate updateable fields
    const invalidFields = Object.keys(updates).filter(field => !UPDATABLE_FIELDS.includes(field));
    if (invalidFields.length > 0) {
      return NextResponse.json({ 
        error: `Cannot update fields: ${invalidFields.join(', ')}. Allowed fields: ${UPDATABLE_FIELDS.join(', ')}` 
      }, { status: 400 });
    }

    const doc = await db.collection('mzs').doc(documentId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const oldData = doc.data();
    
    // Prepare update data with timestamp
    const updateData = {
      ...updates,
      adminUpdatedAt: new Date().toISOString(),
      adminUpdatedBy: authResult.email
    };

    // Update the document
    await doc.ref.update(updateData);

    // Log the changes
    await db.collection('admin_logs').add({
      action: 'update_user',
      adminEmail: authResult.email,
      timestamp: new Date().toISOString(),
      details: {
        documentId,
        userId: oldData?.user_id,
        oldData: Object.keys(updates).reduce((acc, key) => {
          acc[key] = oldData?.[key];
          return acc;
        }, {} as any),
        newData: updates,
        adminNote: adminNote || null
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Updated ${Object.keys(updates).length} field(s)`,
      updatedFields: Object.keys(updates)
    });

  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete user or specific fields
export async function DELETE(request: NextRequest) {
  const authResult = await verifyAdminToken(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { documentId, fieldsToDelete, confirmationCode } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const doc = await db.collection('mzs').doc(documentId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = doc.data();

    if (fieldsToDelete && Array.isArray(fieldsToDelete)) {
      // Delete specific fields
      const hasCriticalFields = fieldsToDelete.some(field => CRITICAL_FIELDS.includes(field));
      
      if (hasCriticalFields && confirmationCode !== 'DELETE_CONFIRMED') {
        return NextResponse.json({ 
          error: 'Deleting critical fields requires confirmation code: DELETE_CONFIRMED' 
        }, { status: 400 });
      }

      // Create update object to remove fields
      const fieldUpdates: any = {};
      fieldsToDelete.forEach(field => {
        fieldUpdates[field] = null; // Firestore uses null to delete fields
      });

      fieldUpdates.adminDeletedFieldsAt = new Date().toISOString();
      fieldUpdates.adminDeletedFieldsBy = authResult.email;

      await doc.ref.update(fieldUpdates);

      // Log field deletion
      await db.collection('admin_logs').add({
        action: 'delete_user_fields',
        adminEmail: authResult.email,
        timestamp: new Date().toISOString(),
        details: {
          documentId,
          userId: userData?.user_id,
          deletedFields: fieldsToDelete,
          originalData: fieldsToDelete.reduce((acc, field) => {
            acc[field] = userData?.[field];
            return acc;
          }, {} as any)
        }
      });

      return NextResponse.json({ 
        success: true, 
        message: `Deleted ${fieldsToDelete.length} field(s)`,
        deletedFields: fieldsToDelete
      });

    } else {
      // Delete entire user document
      if (confirmationCode !== 'DELETE_CONFIRMED') {
        return NextResponse.json({ 
          error: 'Deleting user requires confirmation code: DELETE_CONFIRMED' 
        }, { status: 400 });
      }

      // Log before deletion
      await db.collection('admin_logs').add({
        action: 'delete_user',
        adminEmail: authResult.email,
        timestamp: new Date().toISOString(),
        details: {
          documentId,
          userId: userData?.user_id,
          deletedUserData: userData
        }
      });

      // Delete the document
      await doc.ref.delete();

      return NextResponse.json({ 
        success: true, 
        message: 'User deleted successfully'
      });
    }

  } catch (error) {
    console.error('Error deleting user/fields:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 