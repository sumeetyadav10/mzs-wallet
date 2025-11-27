import { NextRequest, NextResponse } from 'next/server';
import { securityManager } from '@/lib/security/session-manager-enhanced';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  logger.log('Token refresh API called');
  
  try {
    const body = await request.json();
    const { refreshToken } = body;
    
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token required' },
        { status: 400 }
      );
    }
    
    // Extract IP and User Agent
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     request.ip || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const deviceFingerprint = request.headers.get('x-device-fingerprint');
    
    // Attempt to refresh the session
    const newTokens = securityManager.refreshSession(
      refreshToken, 
      ipAddress, 
      userAgent, 
      deviceFingerprint || undefined
    );
    
    if (!newTokens) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }
    
    logger.log('Token refreshed successfully');
    
    return NextResponse.json({
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: newTokens.expiresIn
    });
    
  } catch (error) {
    logger.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}