import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

export async function GET(request: NextRequest) {
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin analytics access attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    return NextResponse.json({ error: authResult.error || 'Admin session required' }, { status: 403 });
  }
  
  // Log successful admin access
  logger.log('✅ Admin analytics API accessed', {
    adminEmail: authResult.email,
    adminId: authResult.adminId,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    deviceFingerprint: request.headers.get('x-device-fingerprint'),
    action: 'view_analytics'
  });

  try {
    logger.log('Generating admin analytics...');

    // Get all mzs users
    const mzsSnapshot = await db.collection('mzs').get();
    const allUsers = mzsSnapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() })) as any[];

    // Deduplicate users by user_id - keep the entry with the most complete data
    const uniqueUsers: any[] = [];
    const userIdMap = new Map();
    
    // Function to score completeness of a user document
    const getUserCompleteness = (user: any) => {
      let score = 0;
      const importantFields = ['created_at', 'migratedAt', 'password_hash', 'auth_email', 'address', 'private_key'];
      importantFields.forEach(field => {
        if (user[field]) score += 1;
      });
      return score;
    };
    
    allUsers.forEach(user => {
      const userId = user.user_id;
      if (userId) {
        const existing = userIdMap.get(userId);
        if (!existing || getUserCompleteness(user) > getUserCompleteness(existing)) {
          userIdMap.set(userId, user);
        }
      } else {
        // Keep users without user_id (might be incomplete records)
        uniqueUsers.push(user);
      }
    });

    // Add deduplicated users to the array
    uniqueUsers.push(...Array.from(userIdMap.values()));

    // Basic statistics (using deduplicated users)
    const totalUsers = uniqueUsers.length;
    const totalDocuments = allUsers.length;
    const duplicateDocuments = totalDocuments - totalUsers;
    
    // Migrated users: Must have migration status AND complete user data
    const migratedUsers = uniqueUsers.filter(user => {
      const hasMigrationStatus = user.migratedAt || user.auth_email;
      const hasCompleteData = user.private_key && user.password_hash;
      return hasMigrationStatus && hasCompleteData;
    }).length;
    
    // Legacy users: Users who don't meet the migrated criteria
    const legacyUsers = uniqueUsers.filter(user => {
      const hasMigrationStatus = user.migratedAt || user.auth_email;
      const hasCompleteData = user.private_key && user.password_hash;
      return !(hasMigrationStatus && hasCompleteData);
    }).length;
    
    const usersWithWallets = uniqueUsers.filter(user => user.address || user.private_key).length;

    // Migration statistics
    const migrationStats = {
      total: totalUsers,
      migrated: migratedUsers,
      legacy: legacyUsers,
      migrationRate: totalUsers > 0 ? (migratedUsers / totalUsers * 100).toFixed(1) : 0,
      totalDocuments,
      duplicateDocuments
    };

    // User registration trends (by creation date) - using unique users only
    const registrationTrends: Record<string, number> = {};
    uniqueUsers.forEach(user => {
      if (user.created_at) {
        try {
          const dateObj = new Date(user.created_at);
          if (!isNaN(dateObj.getTime())) {
            const date = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
            registrationTrends[date] = (registrationTrends[date] || 0) + 1;
          }
        } catch (error) {
          // Skip invalid dates
          logger.log('Invalid date found:', user.created_at);
        }
      }
    });

    // Recent activity (unique users created in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentUsers = uniqueUsers.filter(user => {
      if (!user.created_at) return false;
      try {
        const userDate = new Date(user.created_at);
        return !isNaN(userDate.getTime()) && userDate >= thirtyDaysAgo;
      } catch (error) {
        return false;
      }
    }).length;

    // Auth Email providers analysis (unique users only)
    const authEmailProviders: Record<string, number> = {};
    uniqueUsers.forEach(user => {
      if (user.auth_email) {
        const domain = user.auth_email.split('@')[1];
        authEmailProviders[domain] = (authEmailProviders[domain] || 0) + 1;
      }
    });

    // Field completeness analysis (unique users only)
    const fieldCompleteness = {
      hasUserId: uniqueUsers.filter(u => u.user_id).length,
      hasAuthEmail: uniqueUsers.filter(u => u.auth_email).length,
      hasLegacyEmail: uniqueUsers.filter(u => u.email && !u.auth_email).length,
      hasAddress: uniqueUsers.filter(u => u.address).length,
      hasPrivateKey: uniqueUsers.filter(u => u.private_key).length,
      hasPassword: uniqueUsers.filter(u => u.password_hash).length,
    };

    // Get admin logs
    let recentAdminActions: any[] = [];
    try {
      const adminLogsSnapshot = await db.collection('admin_logs')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();
      
      recentAdminActions = adminLogsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.log('Admin logs collection may not exist yet');
    }

    // Get password reset requests
    let recentResetRequests: any[] = [];
    try {
      const resetRequestsSnapshot = await db.collection('password_reset_requests')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      
      recentResetRequests = resetRequestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.log('Password reset requests collection may not exist yet');
    }

    // Database health metrics - only check for duplicate auth_emails
    const duplicateAuthEmails: Record<string, number> = {};
    
    allUsers.forEach(user => {
      if (user.auth_email) {
        duplicateAuthEmails[user.auth_email] = (duplicateAuthEmails[user.auth_email] || 0) + 1;
      }
    });

    const duplicateAuthEmailCount = Object.values(duplicateAuthEmails).filter((count: number) => count > 1).length;

    return NextResponse.json({
      overview: {
        totalUsers,
        usersWithWallets,
        recentUsers,
        migrationRate: migrationStats.migrationRate
      },
      migrationStats,
      registrationTrends: Object.entries(registrationTrends)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30), // Last 30 days
      authEmailProviders: Object.entries(authEmailProviders)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10),
      fieldCompleteness,
      recentAdminActions,
      recentResetRequests,
      healthMetrics: {
        duplicateAuthEmails: duplicateAuthEmailCount,
        totalDocuments,
        uniqueUsers: totalUsers,
        duplicateDocuments,
        orphanedRecords: uniqueUsers.filter(u => !u.user_id && !u.auth_email).length
      },
      generatedAt: new Date().toISOString(),
      generatedBy: authResult.email
    });

  } catch (error) {
    logger.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to generate analytics' }, { status: 500 });
  }
} 