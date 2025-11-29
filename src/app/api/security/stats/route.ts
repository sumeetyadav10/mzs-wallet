import { NextRequest, NextResponse } from 'next/server';
import { securityManager } from '@/lib/security/session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Apply security middleware - require admin access for security stats
  const securityResult = await securityMiddleware.applySecurityMiddleware(request, {
    requireAuth: true,
    requireAdminRole: true,
    maxAttempts: 10,
    windowMinutes: 5
  });
  
  if (securityResult) {
    return securityResult;
  }

  try {
    // Get security statistics
    const stats = securityManager.getStats();
    
    // Get recent security events (last 100)
    const recentEvents = securityManager.getSecurityEvents(100);
    
    // Analyze attack patterns from recent events
    const attackAnalysis = analyzeAttackPatterns(recentEvents);
    
    const response = NextResponse.json({
      stats,
      recentEvents: recentEvents.slice(0, 20), // Only send last 20 events to client
      attackAnalysis,
      timestamp: Date.now()
    });

    // Add security headers
    const secureHeaders = securityMiddleware.createSecureHeaders();
    Object.entries(secureHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;

  } catch (error) {
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    securityManager.logSecurityEvent({
      type: 'LOGIN_FAIL',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        reason: 'Error retrieving security stats',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return NextResponse.json({ 
      error: 'Failed to retrieve security statistics' 
    }, { status: 500 });
  }
}

function analyzeAttackPatterns(events: any[]): {
  totalAttacks: number;
  attacksByType: Record<string, number>;
  topAttackingIPs: Array<{ ip: string; count: number }>;
  attackTrends: {
    lastHour: number;
    last24Hours: number;
    last7Days: number;
  };
  suspiciousPatterns: Array<{
    pattern: string;
    confidence: number;
    description: string;
  }>;
} {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const oneWeek = 7 * oneDay;

  // Filter attack-related events
  const attackEvents = events.filter(event => 
    ['LOGIN_FAIL', 'RATE_LIMITED', 'IP_BLOCKED', 'CAPTCHA_FAIL'].includes(event.type)
  );

  // Count attacks by type
  const attacksByType: Record<string, number> = {};
  attackEvents.forEach(event => {
    attacksByType[event.type] = (attacksByType[event.type] || 0) + 1;
  });

  // Count attacks by IP
  const ipCounts: Record<string, number> = {};
  attackEvents.forEach(event => {
    ipCounts[event.ipAddress] = (ipCounts[event.ipAddress] || 0) + 1;
  });

  const topAttackingIPs = Object.entries(ipCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  // Calculate time-based trends
  const attackTrends = {
    lastHour: attackEvents.filter(e => now - e.timestamp < oneHour).length,
    last24Hours: attackEvents.filter(e => now - e.timestamp < oneDay).length,
    last7Days: attackEvents.filter(e => now - e.timestamp < oneWeek).length
  };

  // Detect suspicious patterns
  const suspiciousPatterns = [];

  // Korean phone number pattern
  const koreanPhoneAttacks = attackEvents.filter(event => 
    event.email && /^010\d{8}@/.test(event.email)
  ).length;

  if (koreanPhoneAttacks > 10) {
    suspiciousPatterns.push({
      pattern: 'korean_phone_brute_force',
      confidence: Math.min(koreanPhoneAttacks / 100, 1),
      description: `${koreanPhoneAttacks} attacks using Korean phone number patterns detected`
    });
  }

  // High-frequency attack pattern
  const recentAttacks = attackEvents.filter(e => now - e.timestamp < oneHour);
  if (recentAttacks.length > 50) {
    suspiciousPatterns.push({
      pattern: 'high_frequency_attack',
      confidence: Math.min(recentAttacks.length / 200, 1),
      description: `${recentAttacks.length} attacks in the last hour indicates automated attack`
    });
  }

  // Distributed attack pattern (many IPs)
  const uniqueIPs = new Set(recentAttacks.map(e => e.ipAddress)).size;
  if (uniqueIPs > 20 && recentAttacks.length > 100) {
    suspiciousPatterns.push({
      pattern: 'distributed_attack',
      confidence: Math.min(uniqueIPs / 50, 1),
      description: `${uniqueIPs} unique IPs in recent attacks suggests botnet activity`
    });
  }

  return {
    totalAttacks: attackEvents.length,
    attacksByType,
    topAttackingIPs,
    attackTrends,
    suspiciousPatterns
  };
}