import { NextRequest, NextResponse } from 'next/server';
import { SecureTronService } from '@/lib/tron-server';
import { logger } from '@/lib/logger';
import { db } from '@/lib/firebase-admin'; // Use centralized Firebase config

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Require authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Use secure session verification (same as user-wallet2025)
    const token = authHeader.substring(7);
    let session: any;
    
    try {
      const { SecureSessionManager } = await import('@/lib/security/secure-session-manager');
      const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                        req.headers.get('x-real-ip') || 'unknown';
      const deviceFingerprint = req.headers.get('x-device-fingerprint') || '';
      
      const sessionResult = await SecureSessionManager.validateSession(token, deviceFingerprint, ipAddress);
      
      if (!sessionResult.valid || !sessionResult.session) {
        throw new Error('Invalid session');
      }
      
      session = sessionResult.session;
      logger.log(`✅ TRON wallet access from: ${session.email}`);
    } catch (error) {
      logger.error('Session validation failed for TRON wallet:', error instanceof Error ? error.message : error);
      return NextResponse.json(
        { error: 'Invalid session - please login again', requiresRelogin: true },
        { status: 401 }
      );
    }
    
    const email = session.email; // Use email from authenticated session
    
    logger.log('[Tron Wallet API] Authenticated request for email:', email);
    
    try {
      // Query for user by email
      const mzsRef = db.collection('mzs');
      const snapshot = await mzsRef.where('auth_email', '==', email).limit(1).get();
      
      if (snapshot.empty) {
        // Try with email as document ID (legacy format)
        const userDoc = await db.collection('mzs').doc(email).get();
        
        if (!userDoc.exists) {
          logger.error('[Tron Wallet API] User not found:', email);
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        
        const userData = userDoc.data();
        
        // Check if Tron address already exists
        if (userData?.tron_address) {
          logger.log('[Tron Wallet API] Returning existing Tron address:', userData.tron_address);
          
          // Check energy delegation status
          const balance = await SecureTronService.getBalance(userData.tron_address);
          
          return NextResponse.json({ 
            address: userData.tron_address,
            email: email,
            energyDelegated: (balance.resources.energyLimit || 0) > 0,
            resources: balance.resources
          });
        }
        
        // Derive from private key if no Tron address exists
        if (userData?.private_key) {
          const tronAddress = SecureTronService.deriveTronAddress(userData.private_key);
          
          // Auto-delegate energy for gasless transactions
          let energyDelegated = false;
          try {
            const delegationResult = await SecureTronService.delegateEnergy(tronAddress, 100);
            energyDelegated = delegationResult.success;
            logger.log('[Tron Wallet API] Energy delegation result:', delegationResult);
          } catch (delegationError) {
            logger.warn('[Tron Wallet API] Energy delegation failed:', delegationError);
            // Continue even if delegation fails
          }
          
          // Update document with Tron address
          await userDoc.ref.update({
            tron_address: tronAddress,
            tron_energy_delegated: energyDelegated,
            tron_wallet_created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
          return NextResponse.json({ 
            address: tronAddress,
            email: email,
            energyDelegated,
            message: 'Tron wallet derived from existing Ethereum wallet'
          });
        }
        
        return NextResponse.json({ error: 'User has no wallet' }, { status: 400 });
      }
      
      // Handle users found by auth_email query
      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();
      
      // Check if Tron address already exists
      if (userData.tron_address) {
        logger.log('[Tron Wallet API] Returning existing Tron address:', userData.tron_address);
        
        // Check energy delegation status
        const balance = await SecureTronService.getBalance(userData.tron_address);
        
        return NextResponse.json({ 
          address: userData.tron_address,
          email: email,
          energyDelegated: (balance.resources.energyLimit || 0) > 0,
          resources: balance.resources
        });
      }
      
      // Get user's private key
      if (!userData.private_key) {
        logger.error('[Tron Wallet API] User has no wallet');
        return NextResponse.json({ error: 'User does not have a wallet' }, { status: 400 });
      }
      
      // Derive Tron address
      const tronAddress = SecureTronService.deriveTronAddress(userData.private_key);
      
      logger.log('[Tron Wallet API] Derived Tron address:', tronAddress);
      
      // Auto-delegate energy for gasless transactions
      let energyDelegated = false;
      try {
        const delegationResult = await SecureTronService.delegateEnergy(tronAddress, 100);
        energyDelegated = delegationResult.success;
        logger.log('[Tron Wallet API] Energy delegation result:', delegationResult);
      } catch (delegationError) {
        logger.warn('[Tron Wallet API] Energy delegation failed:', delegationError);
        // Continue even if delegation fails
      }
      
      // Update user document with Tron address
      await userDoc.ref.update({
        tron_address: tronAddress,
        tron_energy_delegated: energyDelegated,
        tron_wallet_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      return NextResponse.json({ 
        address: tronAddress,
        email: email,
        energyDelegated,
        message: 'Tron wallet derived from existing Ethereum wallet'
      });
      
    } catch (error: any) {
      logger.error('[Tron Wallet API] Database error:', error);
      return NextResponse.json({ 
        error: 'Database error',
        message: error.message 
      }, { status: 500 });
    }
    
  } catch (error) {
    logger.error('[Tron Wallet API] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// GET endpoint to check wallet status
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const address = searchParams.get('address');
  
  if (!address) {
    return NextResponse.json({ error: 'Address parameter required' }, { status: 400 });
  }
  
  try {
    const balance = await SecureTronService.getBalance(address);
    
    return NextResponse.json({
      address,
      ...balance,
      energyDelegated: (balance.resources.energyLimit || 0) > 0,
    });
  } catch (error) {
    logger.error('[Tron Wallet API] Error checking wallet:', error);
    return NextResponse.json({ 
      error: 'Failed to check wallet',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}