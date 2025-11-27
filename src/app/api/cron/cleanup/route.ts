import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';

// Cron job endpoint for automated cleanup
// This should be called by your hosting provider's cron service
// or an external cron service like cron-job.org

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const cronSecret = request.headers.get('x-cron-secret');
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const results = {
      sessions: { expired: 0, cleaned: 0 },
      otpCodes: { expired: 0, cleaned: 0 },
      otpRequests: { old: 0, cleaned: 0 },
      auditLogs: { old: 0, cleaned: 0 },
      transactionLogs: { old: 0, cleaned: 0 }
    };

    // 1. Cleanup expired sessions (older than 24 hours)
    const sessionExpiry = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const expiredSessionsSnapshot = await db.collection('sessions')
      .where('lastAccessTime', '<', sessionExpiry)
      .get();
    
    results.sessions.expired = expiredSessionsSnapshot.size;
    
    const sessionBatch = db.batch();
    expiredSessionsSnapshot.docs.forEach(doc => {
      sessionBatch.delete(doc.ref);
    });
    
    if (!expiredSessionsSnapshot.empty) {
      await sessionBatch.commit();
      results.sessions.cleaned = expiredSessionsSnapshot.size;
    }

    // 2. Cleanup expired OTP codes (older than 1 hour)
    const otpExpiry = new Date(now.getTime() - 60 * 60 * 1000);
    const expiredOTPSnapshot = await db.collection('otp_codes')
      .where('expiresAt', '<', now)
      .get();
    
    results.otpCodes.expired = expiredOTPSnapshot.size;
    
    const otpBatch = db.batch();
    expiredOTPSnapshot.docs.forEach(doc => {
      otpBatch.delete(doc.ref);
    });
    
    if (!expiredOTPSnapshot.empty) {
      await otpBatch.commit();
      results.otpCodes.cleaned = expiredOTPSnapshot.size;
    }

    // 3. Cleanup old OTP rate limit records (older than 7 days)
    const otpRequestExpiry = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oldOTPRequestsSnapshot = await db.collection('otp_requests')
      .where('createdAt', '<', otpRequestExpiry)
      .get();
    
    results.otpRequests.old = oldOTPRequestsSnapshot.size;
    
    const otpRequestBatch = db.batch();
    oldOTPRequestsSnapshot.docs.forEach(doc => {
      otpRequestBatch.delete(doc.ref);
    });
    
    if (!oldOTPRequestsSnapshot.empty) {
      await otpRequestBatch.commit();
      results.otpRequests.cleaned = oldOTPRequestsSnapshot.size;
    }

    // 4. Archive old audit logs (older than 90 days)
    const auditLogExpiry = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oldAuditLogsSnapshot = await db.collection('audit_logs')
      .where('timestamp', '<', auditLogExpiry)
      .limit(1000) // Process in batches to avoid timeout
      .get();
    
    results.auditLogs.old = oldAuditLogsSnapshot.size;
    
    // Archive to cold storage collection instead of deleting
    const auditBatch = db.batch();
    for (const doc of oldAuditLogsSnapshot.docs) {
      const data = doc.data();
      // Move to archived collection
      auditBatch.create(db.collection('archived_audit_logs').doc(doc.id), {
        ...data,
        archivedAt: now
      });
      auditBatch.delete(doc.ref);
    }
    
    if (!oldAuditLogsSnapshot.empty) {
      await auditBatch.commit();
      results.auditLogs.cleaned = oldAuditLogsSnapshot.size;
    }

    // 5. Cleanup old transaction logs (older than 180 days)
    const transactionLogExpiry = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const oldTransactionLogsSnapshot = await db.collection('transactions')
      .where('createdAt', '<', transactionLogExpiry)
      .limit(1000) // Process in batches
      .get();
    
    results.transactionLogs.old = oldTransactionLogsSnapshot.size;
    
    // Archive transactions instead of deleting
    const txBatch = db.batch();
    for (const doc of oldTransactionLogsSnapshot.docs) {
      const data = doc.data();
      // Move to archived collection
      txBatch.create(db.collection('archived_transactions').doc(doc.id), {
        ...data,
        archivedAt: now
      });
      txBatch.delete(doc.ref);
    }
    
    if (!oldTransactionLogsSnapshot.empty) {
      await txBatch.commit();
      results.transactionLogs.cleaned = oldTransactionLogsSnapshot.size;
    }

    // Log cleanup results
    if (process.env.NODE_ENV === 'production') {
      await db.collection('system_logs').add({
        type: 'cleanup_job',
        timestamp: now,
        results: results,
        success: true
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results: results
    });

  } catch (error) {
    logger.error('Cleanup job error:', error);
    
    // Log error in production
    if (process.env.NODE_ENV === 'production') {
      await db.collection('system_logs').add({
        type: 'cleanup_job_error',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Cleanup job failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Health check for the cron endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}