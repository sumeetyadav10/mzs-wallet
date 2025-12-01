import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

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

export const dynamic = 'force-dynamic';

// GET: Get user by document ID
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin user-management GET access attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    return NextResponse.json({ error: authResult.error || 'Admin session required' }, { status: 403 });
  }
  
  // Log successful admin access
  logger.log('✅ Admin user-management GET accessed', {
    adminEmail: authResult.email,
    adminId: authResult.adminId,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    deviceFingerprint: request.headers.get('x-device-fingerprint'),
    action: 'get_user'
  });

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId');

  if (!docId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  }

  try {
    const doc = await db.collection('mzs').doc(docId).get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = { docId: doc.id, ...doc.data() };
    
    // Remove sensitive fields before returning
    const sanitizedData: any = { ...userData };
    ['password_hash', 'private_key', 'mnemonic', 'seed'].forEach(field => {
      delete sanitizedData[field];
    });
    
    return NextResponse.json({ user: sanitizedData });
  } catch (error) {
    logger.error('Get user error:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}

// PUT: Update user fields
export async function PUT(request: NextRequest) {
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin user-management PUT access attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    return NextResponse.json({ error: authResult.error || 'Admin session required' }, { status: 403 });
  }
  
  // Log successful admin access
  logger.log('✅ Admin user-management PUT accessed', {
    adminEmail: authResult.email,
    adminId: authResult.adminId,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    deviceFingerprint: request.headers.get('x-device-fingerprint'),
    action: 'update_user'
  });

  try {
    const { docId, updates, adminAction } = await request.json();

    if (!docId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Updates required' }, { status: 400 });
    }

    // Add admin audit trail with device info
    const auditData = {
      ...updates,
      lastModifiedBy: authResult.email,
      lastModifiedByAdminId: authResult.adminId,
      lastModifiedAt: new Date().toISOString(),
      lastModifiedFromIP: request.headers.get('x-forwarded-for') || 'unknown',
      lastModifiedDevice: request.headers.get('x-device-fingerprint') || 'unknown',
      adminAction: adminAction || 'field_update'
    };

    await db.collection('mzs').doc(docId).update(auditData);

    // Log the action with device info
    await db.collection('admin_logs').add({
      action: 'user_update',
      adminEmail: authResult.email,
      adminId: authResult.adminId,
      targetDocId: docId,
      updates: Object.keys(updates),
      timestamp: new Date().toISOString(),
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      adminAction
    });

    return NextResponse.json({ 
      success: true, 
      message: 'User updated successfully',
      updatedFields: Object.keys(updates)
    });

  } catch (error) {
    logger.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE: Delete user or specific fields
export async function DELETE(request: NextRequest) {
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin user-management DELETE access attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    return NextResponse.json({ error: authResult.error || 'Admin session required' }, { status: 403 });
  }
  
  // Log successful admin access - CRITICAL ACTION
  logger.warn('⚠️ Admin user-management DELETE accessed', {
    adminEmail: authResult.email,
    adminId: authResult.adminId,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    deviceFingerprint: request.headers.get('x-device-fingerprint'),
    action: 'delete_user_request'
  });

  try {
    const { docId, fieldsToDelete, deleteEntireDoc, confirmationCode } = await request.json();

    if (!docId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Security check - require confirmation code for destructive operations
    if (confirmationCode !== 'DELETE_CONFIRMED') {
      return NextResponse.json({ error: 'Invalid confirmation code' }, { status: 400 });
    }

    if (deleteEntireDoc) {
      // Delete entire document
      await db.collection('mzs').doc(docId).delete();

      // Log the action with device info - CRITICAL
      await db.collection('admin_logs').add({
        action: 'user_delete_complete',
        adminEmail: authResult.email,
        adminId: authResult.adminId,
        targetDocId: docId,
        timestamp: new Date().toISOString(),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        deviceFingerprint: request.headers.get('x-device-fingerprint') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        severity: 'CRITICAL'
      });

      return NextResponse.json({ 
        success: true, 
        message: 'User deleted completely',
        action: 'complete_deletion'
      });

    } else if (fieldsToDelete && fieldsToDelete.length > 0) {
      // Delete specific fields
      const updates: any = {};
      fieldsToDelete.forEach((field: string) => {
        updates[field] = FieldValue.delete();
      });

      // Add audit info
      updates.lastModifiedBy = authResult.email;
      updates.lastModifiedAt = new Date().toISOString();
      updates.adminAction = 'field_deletion';

      await db.collection('mzs').doc(docId).update(updates);

      // Log the action with device info
      await db.collection('admin_logs').add({
        action: 'user_fields_delete',
        adminEmail: authResult.email,
        adminId: authResult.adminId,
        targetDocId: docId,
        deletedFields: fieldsToDelete,
        timestamp: new Date().toISOString(),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        deviceFingerprint: request.headers.get('x-device-fingerprint') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        severity: 'HIGH'
      });

      return NextResponse.json({ 
        success: true, 
        message: `Deleted fields: ${fieldsToDelete.join(', ')}`,
        deletedFields: fieldsToDelete
      });

    } else {
      return NextResponse.json({ error: 'Specify fields to delete or set deleteEntireDoc=true' }, { status: 400 });
    }

  } catch (error) {
    logger.error('Delete operation error:', error);
    return NextResponse.json({ error: 'Delete operation failed' }, { status: 500 });
  }
} 