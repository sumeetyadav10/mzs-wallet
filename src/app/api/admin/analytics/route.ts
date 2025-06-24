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

// Helper function to calculate user completeness score
function getUserCompleteness(user: any): number {
  const importantFields = ['created_at', 'migratedAt', 'password_hash', 'auth_email', 'address', 'private_key'];
  return importantFields.filter(field => user[field] && user[field] !== '').length;
}

// Helper function to safely parse dates
function parseDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  
  if (dateValue.toDate && typeof dateValue.toDate === 'function') {
    return dateValue.toDate();
  }
  
  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  return null;
}

// Helper function to get email provider
function getEmailProvider(email: string): string {
  if (!email || typeof email !== 'string') return 'unknown';
  const domain = email.split('@')[1]?.toLowerCase();
  
  const providers: Record<string, string> = {
    'gmail.com': 'Gmail',
    'yahoo.com': 'Yahoo',
    'hotmail.com': 'Hotmail',
    'outlook.com': 'Outlook',
    'naver.com': 'Naver',
    'daum.net': 'Daum',
    'kakao.com': 'Kakao'
  };
  
  return providers[domain] || 'Other';
}

export async function GET(request: NextRequest) {
  // Verify admin authentication
  const authResult = await verifyAdminToken(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // Fetch all users
    const snapshot = await db.collection('mzs').get();
    const allUsers = snapshot.docs.map(doc => ({
      documentId: doc.id,
      ...doc.data()
    })) as any[];

    // Deduplication logic - keep most complete document for each user_id
    const userMap = new Map();
    
    allUsers.forEach(user => {
      const userId = user.user_id;
      if (!userId) return;
      
      const existing = userMap.get(userId);
      if (!existing) {
        userMap.set(userId, user);
      } else {
        // Compare completeness and keep the more complete one
        const existingScore = getUserCompleteness(existing);
        const currentScore = getUserCompleteness(user);
        
        if (currentScore > existingScore) {
          userMap.set(userId, user);
        } else if (currentScore === existingScore) {
          // If same completeness, prefer the one with migration data
          if (user.migratedAt && !existing.migratedAt) {
            userMap.set(userId, user);
          }
        }
      }
    });

    const uniqueUsers = Array.from(userMap.values());

    // Analyze migration status
    const migratedUsers = uniqueUsers.filter(user => {
      const hasMigrationStatus = user.migratedAt || user.auth_email;
      const hasCompleteData = user.private_key && user.password_hash;
      return hasMigrationStatus && hasCompleteData;
    });

    const legacyUsers = uniqueUsers.filter(user => {
      return user.private_key && user.password_hash && !user.migratedAt && !user.auth_email;
    });

    const incompleteUsers = uniqueUsers.filter(user => {
      return !user.private_key || !user.password_hash;
    });

    // Field completeness analysis
    const fieldStats = {
      user_id: uniqueUsers.filter(u => u.user_id).length,
      auth_email: uniqueUsers.filter(u => u.auth_email).length,
      address: uniqueUsers.filter(u => u.address).length,
      private_key: uniqueUsers.filter(u => u.private_key).length,
      password_hash: uniqueUsers.filter(u => u.password_hash).length,
      created_at: uniqueUsers.filter(u => u.created_at).length,
      migratedAt: uniqueUsers.filter(u => u.migratedAt).length
    };

    // Email provider analysis
    const emailProviders: Record<string, number> = {};
    uniqueUsers.forEach(user => {
      if (user.auth_email) {
        const provider = getEmailProvider(user.auth_email);
        emailProviders[provider] = (emailProviders[provider] || 0) + 1;
      }
    });

    // Date analysis
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentCreations = uniqueUsers.filter(user => {
      const createdAt = parseDate(user.created_at);
      return createdAt && createdAt > last30Days;
    }).length;

    const recentMigrations = uniqueUsers.filter(user => {
      const migratedAt = parseDate(user.migratedAt);
      return migratedAt && migratedAt > last30Days;
    }).length;

    // Health metrics
    const duplicateUserIds = allUsers.length - uniqueUsers.length;
    const usersWithoutId = allUsers.filter(u => !u.user_id).length;
    const usersWithoutKey = uniqueUsers.filter(u => !u.private_key).length;

    // Compile analytics
    const analytics = {
      overview: {
        totalDocuments: allUsers.length,
        totalUniqueUsers: uniqueUsers.length,
        duplicateDocuments: duplicateUserIds
      },
      userTypes: {
        migratedUsers: migratedUsers.length,
        legacyUsers: legacyUsers.length,
        incompleteUsers: incompleteUsers.length
      },
      fieldCompleteness: {
        ...fieldStats,
        completenessPercentages: Object.fromEntries(
          Object.entries(fieldStats).map(([field, count]) => [
            field, 
            Math.round((count / uniqueUsers.length) * 100)
          ])
        )
      },
      emailProviders,
      timeAnalysis: {
        recentCreations30Days: recentCreations,
        recentMigrations30Days: recentMigrations,
        totalWithCreationDate: fieldStats.created_at,
        totalWithMigrationDate: fieldStats.migratedAt
      },
      healthMetrics: {
        duplicateUserIds,
        usersWithoutId,
        usersWithoutPrivateKey: usersWithoutKey,
        healthScore: Math.round(((uniqueUsers.length - usersWithoutKey - usersWithoutId) / uniqueUsers.length) * 100)
      },
      generatedAt: new Date().toISOString()
    };

    return NextResponse.json(analytics);

  } catch (error) {
    console.error('Error generating analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 