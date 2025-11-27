import { NextRequest, NextResponse } from 'next/server';
import { AnomalyMonitor } from '@/lib/security/anomaly-monitor';
import { verifyAdminSession } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    // Admin authentication check
    const authResult = await verifyAdminSession(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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