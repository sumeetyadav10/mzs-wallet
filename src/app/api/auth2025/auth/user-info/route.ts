import { NextRequest, NextResponse } from 'next/server';
import { JWTSecurityEnhanced } from '@/lib/security/jwt-security-enhanced';

export const dynamic = 'force-dynamic';

/**
 * 🔒 USER INFO ENDPOINT - Get user ID from Web3Auth token
 * 
 * This is a minimal endpoint to extract user information from Web3Auth token
 * Used to determine which obfuscated endpoints to generate for the user
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Verify Web3Auth token and extract user info
    const { verifyJWTToken } = await import('@/lib/web3auth-jwt-secure');
    const session = await verifyJWTToken(token);
    
    if (!session || !session.userId || !session.email) {
      return NextResponse.json(
        { error: 'Invalid Web3Auth token' },
        { status: 401 }
      );
    }

    // Return minimal user information needed for endpoint generation
    return NextResponse.json({
      userId: session.userId,
      email: session.email,
      keyPinned: session.keyPinned,
      message: 'User information verified'
    });

  } catch (error) {
    // Don't log verification errors to prevent information leakage
    return NextResponse.json(
      { error: 'Token verification failed' },
      { status: 401 }
    );
  }
}