import { NextRequest, NextResponse } from 'next/server';
import { SecureTronService, TRON_TOKENS } from '@/lib/tron-server';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

// Rate limiting for transactions
const txRateLimitMap = new Map();

// Add a simple delay to prevent rapid API calls
let lastTronApiCall = 0;
const TRON_API_DELAY = 2000; // 2 second delay between calls

function isTxRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowMs = 300000; // 5 minutes
  const maxRequests = 5; // 5 transactions per 5 minutes
  
  const userRequests = txRateLimitMap.get(userId) || [];
  const validRequests = userRequests.filter((timestamp: number) => now - timestamp < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return true;
  }
  
  validRequests.push(now);
  txRateLimitMap.set(userId, validRequests);
  
  return false;
}

export async function POST(request: NextRequest) {
  try {
    logger.log('🔍 TRON Send Request Started');
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
    
    // Add API call delay to prevent rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - lastTronApiCall;
    if (timeSinceLastCall < TRON_API_DELAY) {
      const waitTime = TRON_API_DELAY - timeSinceLastCall;
      logger.log(`[Tron Send API] Waiting ${waitTime}ms to prevent rate limiting`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastTronApiCall = Date.now();
    
    // Rate limiting for transactions per user
    if (isTxRateLimited(session.userId)) {
      return NextResponse.json({ 
        error: 'Transaction rate limit exceeded',
        message: 'Please wait before sending another transaction'
      }, { status: 429 });
    }
    
    const { 
      encryptedPrivateKey, 
      toAddress, 
      amount, 
      token,
      otpCode,
      otpId
    } = await request.json();
    
    // Validate required fields
    if (!encryptedPrivateKey || !toAddress || !amount) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['encryptedPrivateKey', 'toAddress', 'amount']
      }, { status: 400 });
    }
    
    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ 
        error: 'Invalid amount',
        message: 'Amount must be a positive number'
      }, { status: 400 });
    }
    
    // Validate Tron address
    if (!toAddress.startsWith('T') || toAddress.length !== 34) {
      return NextResponse.json({ 
        error: 'Invalid Tron address',
        message: 'Tron addresses must start with T and be 34 characters long'
      }, { status: 400 });
    }

    // OTP Validation is REQUIRED for ALL withdrawals
    const { db } = await import('@/lib/firebase-admin');
    
    // All withdrawals now require OTP verification for maximum security
    if (!otpCode || !otpId) {
      return NextResponse.json({
        error: 'OTP verification required',
        message: 'All withdrawals require email verification for security',
        requiresOTP: true
      }, { status: 400 });
    }
    
    // Validate OTP
    const otpValidationResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/otp/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authHeader.replace('Bearer ', '')}`
      },
      body: JSON.stringify({
        otpId: otpId,
        otpCode: otpCode
      })
    });
    
    if (!otpValidationResponse.ok) {
      const otpError = await otpValidationResponse.json();
      return NextResponse.json({
        error: 'OTP validation failed',
        message: otpError.error || 'Invalid or expired verification code'
      }, { status: 400 });
    }
    
    const otpValidationData = await otpValidationResponse.json();
    if (!otpValidationData.success) {
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Invalid or expired verification code'
      }, { status: 400 });
    }
    
    // Log successful OTP validation for withdrawal
    await db.collection('audit_logs').add({
      userId: session.userId,
      action: 'WITHDRAWAL_OTP_VALIDATED',
      details: {
        blockchain: 'tron',
        amount: amount,
        token: token || 'TRX',
        toAddress: toAddress,
        otpId: otpId
      },
      timestamp: new Date(),
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
    });
    
    // Decrypt private key
    let privateKey: string;
    try {
      // Try client-side decryption first (base64)
      privateKey = decodeURIComponent(atob(encryptedPrivateKey));
    } catch (error) {
      // Fallback to server-side decryption
      try {
        privateKey = decrypt(encryptedPrivateKey);
      } catch (serverError) {
        logger.error('[Tron Send API] Failed to decrypt private key:', error);
        return NextResponse.json({ 
          error: 'Invalid credentials',
          message: 'Failed to decrypt private key'
        }, { status: 401 });
      }
    }
    
    try {
      let result;
      
      if (!token || token === 'TRX') {
        // Send native TRX
        logger.log('🔍 Attempting TRX send:', { toAddress, amount });
        result = await SecureTronService.sendTRX(privateKey, toAddress, amount);
        logger.log('🔍 TRX send result:', result);
      } else {
        // Resolve token symbol to address if needed
        let tokenAddress: string;
        
        if (token in TRON_TOKENS) {
          tokenAddress = TRON_TOKENS[token as keyof typeof TRON_TOKENS];
          logger.log(`[Tron Send API] Resolved token ${token} to ${tokenAddress}`);
        } else if (token.startsWith('T') && token.length === 34) {
          // It's already a token address
          tokenAddress = token;
        } else {
          return NextResponse.json({ 
            error: 'Unknown token',
            message: `Token ${token} is not supported`
          }, { status: 400 });
        }
        
        // Send TRC-20 token
        logger.log('🔍 Attempting TRC20 send:', { toAddress, tokenAddress, amount });
        result = await SecureTronService.sendTRC20(privateKey, toAddress, tokenAddress, amount);
        logger.log('🔍 TRC20 send result:', result);
      }
      
      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error
        }, { status: 400 });
      }
      
      // Send withdrawal notification email for all successful withdrawals
      try {
        const { EmailService } = await import('@/lib/email-service');
        await EmailService.sendWithdrawalAlert(
          session.email || '',
          amount.toString(),
          token || 'TRX',
          toAddress
        );
      } catch (emailError) {
        // Log email error but don't fail the transaction
        logger.error('[Tron Send API] Failed to send withdrawal alert:', emailError);
      }
      
      // Clear private key from memory
      privateKey = '';
      
      return NextResponse.json({
        txid: result.txid,
        success: true,
        status: 'confirmed',
        from: result.from,
        to: result.to,
        amount: result.amount,
        token: result.token,
        explorerUrl: `https://tronscan.org/#/transaction/${result.txid}`
      });
      
    } catch (error: any) {
      logger.error('[Tron Send API] Transaction execution error:', error);
      
      // Handle rate limiting specifically
      if (error.message && error.message.includes('rate exceeded')) {
        return NextResponse.json({
          success: false,
          error: 'Network busy',
          message: 'TRON network is busy. Please wait 10 seconds and try again.'
        }, { status: 429 });
      }
      
      // Handle other API errors
      if (error.message && error.message.includes('429')) {
        return NextResponse.json({
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please wait a moment and try again.'
        }, { status: 429 });
      }
      
      return NextResponse.json({
        success: false,
        error: 'Transaction failed',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again in a moment'
      }, { status: 500 });
    }
    
  } catch (error: any) {
    logger.error('[Tron Send API] Error:', error);
    
    // Handle rate limiting in outer catch
    if (error.message && (error.message.includes('rate exceeded') || error.message.includes('429'))) {
      return NextResponse.json({
        success: false,
        error: 'Network busy',
        message: 'TRON network is experiencing high traffic. Please wait 10 seconds and try again.'
      }, { status: 429 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process transaction',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again in a moment'
    }, { status: 500 });
  }
}