import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { logger } from '@/lib/logger';

const GASLESS_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_GASLESS_MANAGER_ADDRESS as string;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as string;
const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL as string;

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount)'
];

const GASLESS_MANAGER_ABI = [
  'function executeGaslessTransfer(address user, address token, address recipient, uint256 amount, bytes signature) returns (bool)'
];

// Rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10; // Max requests per window
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const dynamic = 'force-dynamic';

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const userRequests = requestCounts.get(userId);
  if (!userRequests || now > userRequests.resetTime) {
    requestCounts.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }
  if (userRequests.count >= MAX_REQUESTS) {
    return true;
  }
  userRequests.count++;
  return false;
}

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
    
    // Import auth helper
    const { requireAuth } = await import('@/lib/security/auth-helper');
    
    // Verify authentication
    const authResult = await requireAuth(req, { allowRefresh: true });
    if ('status' in authResult) {
      return authResult; // Return error response
    }
    
    const { session } = authResult;
    
    // Check rate limit
    if (isRateLimited(session.userId)) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded',
        message: `Maximum ${MAX_REQUESTS} gasless transactions per minute`
      }, { status: 429 });
    }
    
    const { user, token, recipient, amount, signature, otpCode, otpId } = await req.json();
    if (!user || !token || !recipient || !amount || !signature) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // OTP Validation is REQUIRED for ALL withdrawals (including gasless)
    const { db } = await import('@/lib/firebase-admin');
    
    // All withdrawals now require OTP verification for maximum security
    if (!otpCode || !otpId) {
      return NextResponse.json({
        error: 'OTP verification required',
        message: 'All withdrawals require email verification for security',
        requiresOTP: true
      }, { status: 400 });
    }
    
    // Validate OTP using existing validation endpoint
    const otpValidationResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/otp/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('authorization') || ''
      },
      body: JSON.stringify({
        otpId: otpId,
        otpCode: otpCode
      })
    });
    
    if (!otpValidationResponse.ok) {
      let otpError;
      try {
        otpError = await otpValidationResponse.json();
      } catch {
        const errorText = await otpValidationResponse.text();
        logger.error('[Gasless Relay API] OTP validation returned HTML error:', errorText.substring(0, 200));
        otpError = { error: 'OTP validation service error' };
      }
      return NextResponse.json({
        error: 'OTP validation failed',
        message: otpError.error || 'Invalid or expired verification code'
      }, { status: 400 });
    }
    
    let otpValidationData;
    try {
      otpValidationData = await otpValidationResponse.json();
    } catch {
      logger.error('[Gasless Relay API] OTP validation response was not JSON');
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Invalid response from validation service'
      }, { status: 400 });
    }
    
    if (!otpValidationData.success) {
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Invalid or expired verification code'
      }, { status: 400 });
    }
    
    // Log successful OTP validation for gasless withdrawal
    await db.collection('audit_logs').add({
      userId: session.userId,
      action: 'GASLESS_WITHDRAWAL_OTP_VALIDATED',
      details: {
        blockchain: 'polygon',
        amount: amount,
        token: token,
        toAddress: recipient,
        fromAddress: user,
        otpId: otpId,
        gasless: true
      },
      timestamp: new Date(),
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown'
    });
    
    // SECURITY: Validate that the authenticated user matches the transaction user
    // This prevents users from submitting transactions on behalf of others
    // Note: We'll need to verify this matches the user's wallet address
    
    logger.log('Relayer call params:', { user, token, recipient, amount, signature, authenticatedEmail: session.email });
    
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
    
    // Check allowance and balance
    try {
      const tokenContract = new ethers.Contract(token, ERC20_ABI, provider);
      const allowance = await tokenContract.allowance(user, GASLESS_MANAGER_ADDRESS);
      const balance = await tokenContract.balanceOf(user);
      logger.log('User allowance:', allowance.toString());
      logger.log('User balance:', balance.toString());
      
      if (BigInt(allowance) < BigInt(amount)) {
        return NextResponse.json({ error: 'Insufficient allowance. Please approve the contract to spend your tokens.' }, { status: 400 });
      }
      if (BigInt(balance) < BigInt(amount)) {
        return NextResponse.json({ error: 'Insufficient token balance.' }, { status: 400 });
      }
    } catch (err) {
      logger.error('Error checking allowance/balance:', err);
      return NextResponse.json({ error: 'Failed to check allowance or balance.' }, { status: 400 });
    }

    // Get current gas prices - using fallback values for Polygon
    let feeData;
    try {
      feeData = await provider.getFeeData();
    } catch (error) {
      logger.error('Failed to get fee data from provider, using fallback values:', error);
      // Fallback gas prices for Polygon
      feeData = {
        maxFeePerGas: ethers.parseUnits('150', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('35', 'gwei')
      };
    }
    
    logger.log('Current fee data:', {
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString()
    });

    // Instantiate contract with proper ABI
    const contract = new ethers.Contract(GASLESS_MANAGER_ADDRESS, GASLESS_MANAGER_ABI, relayerWallet);
    
    // Simulate transaction
    try {
      await contract.executeGaslessTransfer.staticCall(user, token, recipient, amount, signature);
      logger.log('Simulation succeeded');
    } catch (err: any) {
      logger.error('Simulation failed:', err);
      return NextResponse.json({ 
        error: 'Simulation failed: ' + (err.reason || err.message),
        details: err
      }, { status: 400 });
    }

    // Send transaction with proper gas parameters
    try {
      const tx = await contract.executeGaslessTransfer(user, token, recipient, amount, signature, {
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('150', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('35', 'gwei'),
        gasLimit: 500000 // Set a reasonable gas limit
      });
      
      logger.log('Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      logger.log('Transaction receipt:', receipt);
      
      return NextResponse.json({
        success: true,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
      });
    } catch (error: any) {
      logger.error('Gasless relay error:', error);
      return NextResponse.json({ 
        error: error.reason || error.message || 'Internal server error',
        details: error
      }, { status: 500 });
    }
  } catch (error: any) {
    logger.error('Gasless relay error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      details: error
    }, { status: 500 });
  }
} 