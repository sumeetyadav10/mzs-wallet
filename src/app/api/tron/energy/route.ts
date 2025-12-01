import { NextRequest, NextResponse } from 'next/server';
import { SecureTronService } from '@/lib/tron-server';
import { logger } from '@/lib/logger';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (reuse existing initialization)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    logger.error('Firebase admin initialization error:', error);
  }
}

const db = getFirestore();

// Rate limiting for energy delegation (1 delegation per user per day)
const delegationRateLimit = new Map<string, number>();
const DELEGATION_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

function canDelegateEnergy(userId: string): boolean {
  const now = Date.now();
  const lastDelegation = delegationRateLimit.get(userId);
  
  if (!lastDelegation || now - lastDelegation > DELEGATION_COOLDOWN) {
    delegationRateLimit.set(userId, now);
    return true;
  }
  
  return false;
}

// POST - Delegate energy to a user
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Import auth helper
    const { requireAuth } = await import('@/lib/security/auth-helper');
    
    // Verify authentication
    let session;
    try {
      const authResult = await requireAuth(request, true);
      session = authResult.session;
    } catch (error) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const { address, amount } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }
    
    // SECURITY: Verify the user owns this address
    // First, get the user's Tron address from the database
    const mzsRef = db.collection('mzs');
    const userSnapshot = await mzsRef.where('auth_email', '==', session?.email).limit(1).get();
    
    if (userSnapshot.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userData = userSnapshot.docs[0].data();
    if (!userData.tron_address) {
      return NextResponse.json({ error: 'User does not have a Tron wallet' }, { status: 400 });
    }
    
    // Ensure the user can only delegate energy to their own address
    if (userData.tron_address !== address) {
      logger.warn(`[Tron Energy API] User ${session?.email} attempted to delegate energy to unowned address ${address}`);
      return NextResponse.json({ error: 'You can only delegate energy to your own wallet' }, { status: 403 });
    }
    
    // Check rate limit (1 delegation per 24 hours)
    if (!session) {
      return NextResponse.json({ error: 'Session required' }, { status: 401 });
    }
    
    if (!canDelegateEnergy(session.userId || '')) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded',
        message: 'You can only request energy delegation once every 24 hours'
      }, { status: 429 });
    }
    
    // Default to 100 TRX worth of energy if not specified
    const delegationAmount = amount || 100;
    
    logger.log(`[Tron Energy API] Delegating ${delegationAmount} TRX worth of energy to ${address}`);
    
    const result = await SecureTronService.delegateEnergy(address, delegationAmount);
    
    if (result.success) {
      // Update Firebase to track delegation
      try {
        const mzsRef = db.collection('mzs');
        const snapshot = await mzsRef.where('tron_address', '==', address).limit(1).get();
        
        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];
          await userDoc.ref.update({
            tron_energy_delegated: true,
            tron_energy_amount: delegationAmount,
            tron_energy_delegated_at: new Date().toISOString(),
          });
        }
      } catch (dbError) {
        logger.warn('[Tron Energy API] Failed to update Firebase:', dbError);
        // Continue even if Firebase update fails
      }
      
      return NextResponse.json({
        success: true,
        txid: result.txid,
        delegatedTo: address,
        amount: delegationAmount,
        message: `Successfully delegated ${delegationAmount} TRX worth of energy`,
        explorerUrl: `https://tronscan.org/#/transaction/${result.txid}`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 400 });
    }
    
  } catch (error) {
    logger.error('[Tron Energy API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to delegate energy',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// GET - Check energy status for an address
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  
  if (!address) {
    return NextResponse.json({ error: 'Address parameter required' }, { status: 400 });
  }
  
  try {
    const balance = await SecureTronService.getBalance(address);
    
    // Check if user has delegated energy
    const hasDelegatedEnergy = (balance.resources.energyLimit || 0) > 0;
    
    return NextResponse.json({
      address,
      hasDelegatedEnergy,
      resources: {
        energy: balance.resources.energyLimit || 0,
        energyUsed: balance.resources.energyUsed || 0,
        energyAvailable: (balance.resources.energyLimit || 0) - (balance.resources.energyUsed || 0),
        bandwidth: balance.resources.freeNetLimit || 0,
        bandwidthUsed: balance.resources.freeNetUsed || 0,
        bandwidthAvailable: (balance.resources.freeNetLimit || 0) - (balance.resources.freeNetUsed || 0),
      },
      recommendation: hasDelegatedEnergy 
        ? 'Energy available for gasless transactions'
        : 'Request energy delegation for free transactions',
    });
  } catch (error) {
    logger.error('[Tron Energy API] Error checking energy:', error);
    return NextResponse.json({ 
      error: 'Failed to check energy status',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}