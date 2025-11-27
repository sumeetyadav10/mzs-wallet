import { NextRequest, NextResponse } from 'next/server';
import { SecureTronService, TRON_TOKENS, getTeamWalletAddress } from '@/lib/tron-server';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

// Transaction monitoring
interface TransactionRecord {
  id: string;
  txid?: string;
  status: 'pending' | 'confirmed' | 'failed';
  fromAddress: string;
  toAddress: string;
  amount: number;
  token?: string;
  timestamp: number;
  error?: string;
  gasless: boolean;
}

const transactionStore = new Map<string, TransactionRecord>();

// Rate limiting for transactions
const txRateLimitMap = new Map();

function isTxRateLimited(clientId: string): boolean {
  const now = Date.now();
  const windowMs = 300000; // 5 minutes
  const maxRequests = 10; // 10 transactions per 5 minutes for gasless
  
  const clientRequests = txRateLimitMap.get(clientId) || [];
  const validRequests = clientRequests.filter((timestamp: number) => now - timestamp < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return true;
  }
  
  validRequests.push(now);
  txRateLimitMap.set(clientId, validRequests);
  
  return false;
}

export async function POST(request: NextRequest) {
  logger.log('[Tron Gasless API] POST request received');
  
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
    const authResult = await requireAuth(request, { allowRefresh: true });
    if ('status' in authResult) {
      return authResult; // Return error response
    }
    
    const { session } = authResult;
    
    // Rate limiting per user instead of IP
    if (isTxRateLimited(session.userId)) {
      return NextResponse.json({ 
        error: 'Transaction rate limit exceeded',
        message: 'Please wait before sending another transaction'
      }, { status: 429 });
    }
    
    const body = await request.json();
    logger.log('[Tron Gasless API] Request body:', {
      hasEncryptedKey: !!body.encryptedPrivateKey,
      toAddress: body.toAddress,
      amount: body.amount,
      token: body.token,
      hasOTP: !!(body.otpCode && body.otpId)
    });
    
    const { 
      encryptedPrivateKey, 
      toAddress, 
      amount, 
      token,
      otpCode,
      otpId
    } = body;
    
    // Validate required fields
    if (!encryptedPrivateKey || !toAddress || !amount) {
      logger.error('[Tron Gasless API] Missing required fields:', {
        hasEncryptedKey: !!encryptedPrivateKey,
        hasToAddress: !!toAddress,
        hasAmount: !!amount,
        amount
      });
      return NextResponse.json({ 
        error: 'Missing required fields',
        message: 'Required fields: encryptedPrivateKey, toAddress, amount',
        required: ['encryptedPrivateKey', 'toAddress', 'amount']
      }, { status: 400 });
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
        'Authorization': request.headers.get('authorization') || ''
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
        logger.error('[Tron Gasless API] OTP validation returned HTML error:', errorText.substring(0, 200));
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
      logger.error('[Tron Gasless API] OTP validation response was not JSON');
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
        blockchain: 'tron',
        amount: amount,
        token: token || 'TRC-20',
        toAddress: toAddress,
        otpId: otpId,
        gasless: true
      },
      timestamp: new Date(),
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
    });
    
    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      logger.error('[Tron Gasless API] Invalid amount:', {
        amount,
        type: typeof amount,
        isPositive: amount > 0
      });
      return NextResponse.json({ 
        error: 'Invalid amount',
        message: 'Amount must be a positive number',
        receivedAmount: amount,
        receivedType: typeof amount
      }, { status: 400 });
    }
    
    // Validate Tron address
    if (!toAddress.startsWith('T') || toAddress.length !== 34) {
      return NextResponse.json({ 
        error: 'Invalid Tron address',
        message: 'Tron addresses must start with T and be 34 characters long'
      }, { status: 400 });
    }
    
    // Decrypt private key
    let privateKey: string;
    try {
      // Try client-side decryption first (base64)
      privateKey = decodeURIComponent(atob(encryptedPrivateKey));
      logger.log('[Tron Gasless API] Successfully decrypted private key (base64 method)');
    } catch (error) {
      // Fallback to server-side decryption
      try {
        privateKey = decrypt(encryptedPrivateKey);
        logger.log('[Tron Gasless API] Successfully decrypted private key (server method)');
      } catch (serverError) {
        logger.error('[Tron Gasless API] Failed to decrypt private key:', error);
        logger.error('[Tron Gasless API] Encrypted data sample:', encryptedPrivateKey.substring(0, 20) + '...');
        return NextResponse.json({ 
          error: 'Invalid credentials',
          message: 'Failed to decrypt private key'
        }, { status: 401 });
      }
    }
    
    // Gasless is only for TRC-20 tokens, not TRX
    if (!token || token === 'TRX') {
      logger.error('[Tron Gasless API] Gasless not supported for TRX transfers');
      return NextResponse.json({ 
        error: 'Unsupported token',
        message: 'Gasless transactions are only available for TRC-20 tokens (USDT, USDC, etc.), not TRX. Please use regular send for TRX transfers.'
      }, { status: 400 });
    }
    
    // Additional validation: Check if sending to team wallet address
    const teamWalletAddress = getTeamWalletAddress();
    if (teamWalletAddress && toAddress === teamWalletAddress) {
      logger.error('[Tron Gasless API] Attempt to send to team wallet address:', teamWalletAddress);
      return NextResponse.json({ 
        error: 'Invalid recipient',
        message: 'Cannot send funds to the gasless service wallet'
      }, { status: 400 });
    }
    
    // Create transaction record
    const transactionId = `tron_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const txRecord: TransactionRecord = {
      id: transactionId,
      status: 'pending',
      fromAddress: '', // Will be filled after transaction
      toAddress,
      amount,
      token,
      timestamp: Date.now(),
      gasless: true
    };
    
    transactionStore.set(transactionId, txRecord);
    
    try {
      // Resolve token symbol to address if needed
      let tokenAddress: string | undefined;
      
      if (token && token !== 'TRX') {
        // Check if it's a known token symbol
        if (token in TRON_TOKENS) {
          tokenAddress = TRON_TOKENS[token as keyof typeof TRON_TOKENS];
          logger.log(`[Tron Gasless API] Resolved token ${token} to ${tokenAddress}`);
        } else if (token.startsWith('T') && token.length === 34) {
          // It's already a token address
          tokenAddress = token;
        } else {
          return NextResponse.json({ 
            error: 'Unknown token',
            message: `Token ${token} is not supported`
          }, { status: 400 });
        }
      }
      
      // Execute gasless transaction
      const result = await SecureTronService.sendGasless(
        privateKey,
        toAddress,
        amount,
        tokenAddress
      );
      
      if (!result.success) {
        txRecord.status = 'failed';
        txRecord.error = result.error;
        transactionStore.set(transactionId, txRecord);
        
        return NextResponse.json({
          transactionId,
          success: false,
          error: result.error
        }, { status: 400 });
      }
      
      // Update transaction record with success
      txRecord.txid = result.txid;
      txRecord.status = 'confirmed';
      txRecord.fromAddress = result.from;
      transactionStore.set(transactionId, txRecord);
      
      // Clear private key from memory
      privateKey = '';
      
      return NextResponse.json({
        transactionId,
        txid: result.txid,
        success: true,
        status: 'confirmed',
        gasless: true,
        message: token === 'TRX' && result.from === getTeamWalletAddress() 
          ? 'Transaction sent from team wallet (TRX gasless not fully implemented)' 
          : 'Transaction sent successfully with zero fees',
        from: result.from,
        to: result.to,
        explorerUrl: `https://tronscan.org/#/transaction/${result.txid}`
      });
      
    } catch (error: any) {
      logger.error('[Tron Gasless API] Transaction execution error:', error);
      logger.error('[Tron Gasless API] Error details:', {
        message: error.message,
        stack: error.stack,
        transactionId,
        toAddress,
        amount,
        token
      });
      
      txRecord.status = 'failed';
      txRecord.error = error.message;
      transactionStore.set(transactionId, txRecord);
      
      return NextResponse.json({
        transactionId,
        success: false,
        error: 'Transaction failed',
        message: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? {
          actualError: error.message,
          toAddress,
          amount,
          token
        } : undefined
      }, { status: 500 });
    }
    
  } catch (error: any) {
    logger.error('[Tron Gasless API] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process transaction',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

// GET endpoint to check transaction status
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const transactionId = searchParams.get('transactionId');
  
  if (!transactionId) {
    return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
  }
  
  const txRecord = transactionStore.get(transactionId);
  
  if (!txRecord) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }
  
  return NextResponse.json({
    transactionId: txRecord.id,
    status: txRecord.status,
    txid: txRecord.txid,
    timestamp: txRecord.timestamp,
    error: txRecord.error,
    gasless: txRecord.gasless,
    explorerUrl: txRecord.txid ? `https://tronscan.org/#/transaction/${txRecord.txid}` : undefined
  });
}