import { NextRequest, NextResponse } from 'next/server';
import { AnomalyMonitor } from '@/lib/security/anomaly-monitor';
import { verifyAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Admin authentication check with device fingerprint
    const authResult = await verifyAdminSession(request);
    if (!authResult.success) {
      logger.warn('🚨 Unauthorized admin anomalies access attempt', {
        error: authResult.error,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
        userAgent: request.headers.get('user-agent') || 'unknown'
      });
      return NextResponse.json(
        { error: authResult.error || 'Admin session required' },
        { status: 403 }
      );
    }
    
    // Log successful admin access
    logger.log('✅ Admin anomalies API accessed', {
      adminEmail: authResult.email,
      adminId: authResult.adminId,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint'),
      action: 'view_anomalies'
    });

    const searchParams = request.nextUrl.searchParams;
    const severity = searchParams.get('severity') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');
    const summary = searchParams.get('summary') === 'true';

    if (summary) {
      // Get summary statistics
      const summaryData = await AnomalyMonitor.getSummary();
      return NextResponse.json({
        success: true,
        summary: summaryData
      });
    } else {
      // Get recent anomalies
      const anomalies = await AnomalyMonitor.getRecentAnomalies(severity, limit);
      
      return NextResponse.json({
        success: true,
        anomalies,
        count: anomalies.length
      });
    }
  } catch (error) {
    // Failed to fetch anomalies
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}