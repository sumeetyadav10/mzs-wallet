import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { createAuthTokens } from '@/lib/security/auth-helper';
import { securityManager } from '@/lib/security/session-manager-enhanced';
import { APISecurityMiddleware } from '@/lib/security/api-security-middleware';
import { JWTSecurityEnhanced } from '@/lib/security/jwt-security-enhanced';
import { SecureSessionManager } from '@/lib/security/secure-session-manager';
import { SQLInjectionPrevention } from '@/lib/security/sql-injection-prevention';

export const dynamic = 'force-dynamic';

// 🔧 FIX WEB3AUTH JWT TRUNCATION - Increase body size limit for this route
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds

export async function POST(request: NextRequest) {
  try {
    // Debug headers
    logger.log('[OAuth] Request headers:', {
      'x-client-type': request.headers.get('x-client-type'),
      'x-app-token': request.headers.get('x-app-token'),
      'origin': request.headers.get('origin'),
      'referer': request.headers.get('referer'),
      'user-agent': request.headers.get('user-agent')
    });
    
    // 🔒 COMPREHENSIVE SECURITY VALIDATION
    const securityValidation = await APISecurityMiddleware.validateRequest(request, false); // Don't require auth for OAuth
    if (!securityValidation.valid) {
      logger.error('[OAuth] Security validation failed:', securityValidation.errors);
      return securityValidation.response!;
    }
    
    const body = (securityValidation as any).body || await request.json();
    const { email, userInfo, idToken, deviceFingerprint } = body;
    
    // Web3Auth JWT validation is done below - no need for custom app tokens
    
    if (!email || !userInfo) {
      return NextResponse.json(
        { error: 'Email and user info required' },
        { status: 400 }
      );
    }
    
    logger.log('OAuth authentication request for:', email);
    
    // NEW SECURE AUTHENTICATION: Verify Web3Auth ID token if provided
    let verifiedUserData = null;
    if (idToken) {
      try {
        logger.log('🔐 Verifying Web3Auth ID token...');
        logger.log('🔍 ID token length:', idToken.length);
        logger.log('🔍 ID token preview:', idToken.substring(0, 50) + '...');
        
        const { verifyWeb3AuthIdToken } = await import('@/lib/web3auth-jwt-secure');
        verifiedUserData = await verifyWeb3AuthIdToken(idToken);
        
        if (!verifiedUserData) {
          logger.error('❌ Failed to verify Web3Auth ID token');
          return NextResponse.json(
            { error: 'Invalid Web3Auth token' },
            { status: 401 }
          );
        }
        
        logger.log('✅ Web3Auth ID token verified successfully:', {
          userId: verifiedUserData.userId,
          email: verifiedUserData.email,
          provider: (verifiedUserData as any).provider
        });
        
        // Ensure the token's email matches the request email
        if (verifiedUserData.email !== email) {
          logger.error('❌ Email mismatch between token and request');
          return NextResponse.json(
            { error: 'Authentication failed: email mismatch' },
            { status: 401 }
          );
        }
        
      } catch (verifyError) {
        logger.error('❌ Web3Auth ID token verification failed:', verifyError);
        logger.error('❌ Full error details:', {
          message: verifyError instanceof Error ? verifyError.message : verifyError,
          stack: verifyError instanceof Error ? verifyError.stack : null
        });
        
        // For debugging, let's decode the token to see what's inside
        logger.log('🔍 Attempting to decode token for debugging...');
        try {
          const jwt = await import('jsonwebtoken');
          const decoded = jwt.decode(idToken, { complete: true });
          logger.log('🔍 Decoded token structure:', {
            header: decoded?.header,
            payloadKeys: decoded?.payload ? Object.keys(decoded.payload as any) : null,
            payloadSample: decoded?.payload,
            tokenLength: idToken.length,
            tokenStart: idToken.substring(0, 50),
            tokenEnd: idToken.substring(idToken.length - 50),
            errorMessage: verifyError instanceof Error ? verifyError.message : String(verifyError)
          });
          
          // Try manual base64 decoding to see if token is corrupted
          const tokenParts = idToken.split('.');
          logger.log('🔍 Token parts analysis:', {
            partsCount: tokenParts.length,
            headerLength: tokenParts[0]?.length || 0,
            payloadLength: tokenParts[1]?.length || 0,
            signatureLength: tokenParts[2]?.length || 0,
            headerStart: tokenParts[0]?.substring(0, 20) || '',
            payloadStart: tokenParts[1]?.substring(0, 20) || ''
          });
          
          // Try to decode header manually
          if (tokenParts[0]) {
            try {
              const headerDecoded = Buffer.from(tokenParts[0], 'base64url').toString();
              logger.log('🔍 Manual header decode:', JSON.parse(headerDecoded));
            } catch (manualError) {
              logger.error('❌ Manual header decode failed:', manualError);
            }
          }
          
        } catch (decodeError) {
          logger.error('❌ Cannot even decode token:', decodeError);
        }
        
        // Log the detailed error for debugging
        const detailedError = verifyError instanceof Error ? verifyError.message : String(verifyError);
        logger.error('❌ Web3Auth token verification failed:', detailedError);
        
        return NextResponse.json(
          { 
            error: 'Invalid authentication token',
            debug: process.env.NODE_ENV === 'development' ? {
              details: detailedError,
              tokenLength: idToken?.length || 0,
              tokenStart: idToken?.substring(0, 50) || ''
            } : undefined
          },
          { status: 401 }
        );
      }
    } else {
      logger.error('❌ No Web3Auth ID token provided - OAuth requires valid Web3Auth authentication');
      return NextResponse.json(
        { error: 'Web3Auth ID token required for OAuth authentication' },
        { status: 401 }
      );
    }
    
    // Query Firebase to get user's auth_email (for dynamic email integration)
    const { db } = await import('@/lib/firebase-admin');
    let userEmail = email; // Default to the OAuth email
    let firebaseUserId = email;
    
    try {
      // 🔒 SECURE DATABASE QUERY - Check if user exists
      let existingUser = null;
      
      try {
        // First try auth_email field
        const authEmailQuery = await db.collection('mzs')
          .where('auth_email', '==', email)
          .limit(1)
          .get();
        
        if (!authEmailQuery.empty) {
          existingUser = authEmailQuery.docs[0];
        } else {
          // Try legacy email field as fallback
          const emailQuery = await db.collection('mzs')
            .where('email', '==', email)
            .limit(1)
            .get();
          
          if (!emailQuery.empty) {
            existingUser = emailQuery.docs[0];
          }
        }
      } catch (queryError) {
        logger.log(`Error querying user: ${queryError}`);
      }
      
      if (existingUser) {
        const userData = existingUser.data();
        firebaseUserId = userData.user_id || email;
        userEmail = userData.auth_email || userData.email || email;
        
        logger.log(`🔍 Found existing user: ${firebaseUserId} with auth_email: ${userEmail}`);
      } else {
        logger.log(`⚠️ No existing user found in Firebase for email: ${email}`);
      }
    } catch (error) {
      logger.error('Error querying Firebase for user:', error);
      // Fallback to OAuth email if Firebase query fails
    }

    // 🔧 USE SAME IP EXTRACTION AS API MIDDLEWARE - Fixes IP mismatch
    const ipAddress = APISecurityMiddleware.extractClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const clientDeviceFingerprint = request.headers.get('x-device-fingerprint') || deviceFingerprint;
    
    // Create session for OAuth user with dynamic email from Firebase
    const sessionData = {
      userId: firebaseUserId,
      email: userEmail, // This will be the auth_email from Firebase if user exists
      isAdmin: false,
      loginTime: Date.now(),
      lastActivity: Date.now(),
      ipAddress,
      userAgent,
      deviceFingerprint: clientDeviceFingerprint,
      authMethod: 'oauth',
      oauthProvider: userInfo.typeOfLogin || 'unknown'
    };
    
    // NEW SECURE SESSION CREATION
    let accessToken, refreshToken;
    
    if (verifiedUserData && idToken) {
      // 🔒 SECURE SESSION CREATION using Web3Auth token
      logger.log('🔐 Creating secure database-backed session');
      
      try {
        // Create secure session in database
        const { sessionToken, sessionData: createdSession } = await SecureSessionManager.createSecureSession({
          web3AuthIdToken: idToken,
          verifiedUserData: {
            ...verifiedUserData,
            userId: sessionData.userId,
            email: sessionData.email
          },
          deviceFingerprint: clientDeviceFingerprint || '',
          ipAddress,
          userAgent
        });
        
        accessToken = sessionToken;
        refreshToken = sessionToken; // Same token for now, can implement separate refresh logic later
        
        logger.log('✅ Secure session created successfully:', {
          sessionId: createdSession.sessionId.substring(0, 16) + '...',
          userId: createdSession.userId,
          email: createdSession.email
        });
        
      } catch (sessionError) {
        logger.error('Failed to create secure session:', sessionError);
        return NextResponse.json(
          { error: 'Session creation failed' },
          { status: 500 }
        );
      }
      
    } else {
      // SECURITY: No fallback - Web3Auth ID token is required
      logger.error('❌ No valid Web3Auth ID token provided');
      return NextResponse.json(
        { error: 'Web3Auth authentication required' },
        { status: 401 }
      );
    }
    
    // Still create session in security manager for audit trail
    try {
      await securityManager.createSession({
        userId: sessionData.userId,
        email: sessionData.email,
        deviceFingerprint: clientDeviceFingerprint || crypto.randomUUID(),
        isAdmin: sessionData.isAdmin
      });
    } catch (e) {
      // Don't fail if session creation fails (cache might be full)
    }
    
    // Log successful OAuth login
    securityManager.logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      userId: sessionData.userId,
      email: sessionData.email,
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: {
        method: 'oauth',
        provider: sessionData.oauthProvider
      }
    });
    
    // 🔒 CREATE SECURE RESPONSE WITH ENHANCED HEADERS
    const response = NextResponse.json({
      success: true,
      accessToken,
      refreshToken,
      sessionToken: accessToken, // Backward compatibility
      email: sessionData.email,
      authMethod: 'oauth'
    });
    
    return APISecurityMiddleware.addSecurityHeaders(response);
    
  } catch (error) {
    logger.error('OAuth authentication error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}