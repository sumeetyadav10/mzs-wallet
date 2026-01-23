import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Transaction monitoring
interface TransactionRecord {
  id: string;
  txHash?: string;
  status: 'pending' | 'confirmed' | 'failed';
  fromAddress: string;
  toAddress: string;
  amount: number;
  token?: string;
  timestamp: number;
  confirmations: number;
  error?: string;
}

const transactionStore = new Map<string, TransactionRecord>();

// Rate limiting for transactions
const txRateLimitMap = new Map();

function isTxRateLimited(clientId: string): boolean {
  const now = Date.now();
  const windowMs = 300000; // 5 minutes
  const maxRequests = 5; // 5 transactions per 5 minutes

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
  try {
    // Web3Auth JWT verification
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Web3Auth authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    let session: any;
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || '';
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';

    try {
      // Use SecureSessionManager to validate session from database
      const { SecureSessionManager } = await import('@/lib/security/secure-session-manager');
      const validationResult = await SecureSessionManager.validateSession(token, deviceFingerprint, ipAddress);

      if (!validationResult.valid || !validationResult.session) {
        throw new Error(validationResult.error || 'Session validation failed');
      }

      session = validationResult.session;

      if (!session.userId || !session.email) {
        throw new Error('Invalid session data');
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid session - please login again', requiresRelogin: true },
        { status: 401 }
      );
    }

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
      token: cryptoToken,
      otpCode,
      otpId
    } = await request.json();

    console.log('🔍 [Polygon Send] Request received:', {
      toAddress,
      amount,
      token: cryptoToken,
      userId: session.userId
    });

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

    // OTP Validation - REQUIRED for ALL withdrawals
    const { db } = await import('@/lib/firebase-admin');
    const crypto = await import('crypto');

    if (!otpCode || !otpId) {
      return NextResponse.json({
        error: 'OTP verification required',
        message: 'All withdrawals require email verification for security',
        requiresOTP: true
      }, { status: 400 });
    }

    console.log('✅ [Polygon Send] OTP provided, validating...');

    // Fetch OTP record
    const otpDoc = await db.collection('otp_codes').doc(otpId).get();

    if (!otpDoc.exists) {
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Invalid or expired verification code'
      }, { status: 400 });
    }

    const otpData = otpDoc.data()!;

    // Check if OTP is expired
    if (new Date() > otpData.expiresAt.toDate()) {
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Verification code has expired'
      }, { status: 400 });
    }

    // Check if OTP is already used
    if (otpData.used) {
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Verification code has already been used',
        requiresNewOTP: true
      }, { status: 400 });
    }

    // Check if OTP belongs to the correct user
    if (otpData.userId !== session.userId) {
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Invalid verification code - user mismatch'
      }, { status: 400 });
    }

    // Verify OTP code with salted hash
    const testHash = crypto.createHash('sha256').update(otpData.salt + otpCode + otpData.userId).digest('hex');

    if (testHash !== otpData.otpHash) {
      return NextResponse.json({
        error: 'OTP validation failed',
        message: 'Invalid verification code'
      }, { status: 400 });
    }

    console.log('✅ [Polygon Send] OTP validation successful');

    // Mark OTP as used
    await otpDoc.ref.update({
      used: true,
      usedAt: new Date()
    });

    // Log successful OTP validation for withdrawal
    await db.collection('audit_logs').add({
      userId: session.userId,
      action: 'WITHDRAWAL_OTP_VALIDATED',
      details: {
        blockchain: 'polygon',
        amount: amount,
        token: cryptoToken || 'MATIC',
        toAddress: toAddress,
        otpId: otpId
      },
      timestamp: new Date(),
      ipAddress: ipAddress
    });

    // Create transaction record
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const txRecord: TransactionRecord = {
      id: transactionId,
      status: 'pending',
      fromAddress: '',
      toAddress,
      amount,
      token: cryptoToken,
      timestamp: Date.now(),
      confirmations: 0
    };

    transactionStore.set(transactionId, txRecord);

    try {
      console.log('🔑 [Polygon Send] Decrypting private key...');
      // Handle private key decryption
      let privateKey: string;

      // Check if it's already a valid private key format
      if (encryptedPrivateKey.startsWith('0x') && encryptedPrivateKey.length === 66) {
        privateKey = encryptedPrivateKey;
      } else {
        // Try client-side base64 decryption first
        try {
          privateKey = decodeURIComponent(atob(encryptedPrivateKey));
        } catch (error) {
          // Fallback to server-side decryption
          const { decryptPrivateKey } = await import('@/lib/server-crypto');
          privateKey = decryptPrivateKey(encryptedPrivateKey, session.email);
        }
      }

      console.log('🌐 [Polygon Send] Setting up provider...');

      // SIMPLE: Use single reliable RPC (same as working test script)
      const provider = new ethers.JsonRpcProvider('https://polygon.drpc.org', {
        chainId: 137,
        name: 'polygon'
      });

      const wallet = new ethers.Wallet(privateKey, provider);
      console.log('💼 [Polygon Send] Wallet:', wallet.address);

      // SIMPLE: Get real network gas prices with 50% buffer (same as test script)
      console.log('⛽ [Polygon Send] Fetching network gas prices...');
      const feeData = await provider.getFeeData();

      if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        throw new Error('Failed to fetch gas prices');
      }

      // Add 50% buffer (same as test script that worked)
      const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * BigInt(150)) / BigInt(100);
      const maxFeePerGas = (feeData.maxFeePerGas * BigInt(150)) / BigInt(100);

      console.log('✅ [Polygon Send] Gas with 50% buffer:', {
        priority: `${Number(maxPriorityFeePerGas) / 1e9} gwei`,
        maxFee: `${Number(maxFeePerGas) / 1e9} gwei`
      });

      // Validate address
      const checksummedToAddress = ethers.getAddress(toAddress);

      let txHash: string = '';

      if (cryptoToken === 'MATIC' || !cryptoToken) {
        console.log('💰 [Polygon Send] Sending MATIC...');

        // SIMPLE: Send transaction with proper gas
        const tx = await wallet.sendTransaction({
          to: checksummedToAddress,
          value: ethers.parseEther(amount.toString()),
          maxPriorityFeePerGas,
          maxFeePerGas,
          type: 2
        });

        txHash = tx.hash;
        console.log('✅ [Polygon Send] Transaction sent:', txHash);

      } else {
        console.log('🪙 [Polygon Send] Sending token:', cryptoToken);

        // Get token contract address
        let tokenAddress: string;
        if (cryptoToken === 'MZS') {
          tokenAddress = '0x1aDb749FFDA33251e1503672951b5A4234518Fa7';
        } else if (cryptoToken === 'USDT') {
          tokenAddress = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
        } else if (cryptoToken === 'USDC') {
          tokenAddress = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
        } else {
          // Try to treat it as a custom token address
          if (ethers.isAddress(cryptoToken)) {
            tokenAddress = cryptoToken;
          } else {
            throw new Error(`Token ${cryptoToken} is not supported on Polygon. Please add the token contract address.`);
          }
        }

        const checksummedTokenAddress = ethers.getAddress(tokenAddress);

        // SIMPLE: Create contract and send
        const tokenABI = [
          "function transfer(address to, uint256 amount) returns (bool)",
          "function decimals() view returns (uint8)",
          "function balanceOf(address account) view returns (uint256)"
        ];
        const tokenContract = new ethers.Contract(checksummedTokenAddress, tokenABI, wallet);

        const decimals = await tokenContract.decimals();
        const transferAmount = ethers.parseUnits(amount.toString(), decimals);

        console.log('💰 [Polygon Send] Token amount:', ethers.formatUnits(transferAmount, decimals));

        // Check balance
        const balance = await tokenContract.balanceOf(wallet.address);
        if (balance < transferAmount) {
          return NextResponse.json({
            error: 'Insufficient token balance',
            message: `You don't have enough ${cryptoToken} tokens`
          }, { status: 400 });
        }

        // SIMPLE: Send token transaction with proper gas
        const tx = await tokenContract.transfer(checksummedToAddress, transferAmount, {
          maxPriorityFeePerGas,
          maxFeePerGas,
          gasLimit: BigInt(100000),
          type: 2
        });

        txHash = tx.hash;
        console.log('✅ [Polygon Send] Token transaction sent:', txHash);
      }

      // Update transaction record
      txRecord.txHash = txHash;
      txRecord.status = 'confirmed';
      txRecord.fromAddress = wallet.address;
      transactionStore.set(transactionId, txRecord);

      console.log('✅ [Polygon Send] Success:', txHash);

      // Send withdrawal notification email
      try {
        const { EmailService } = await import('@/lib/email-service');
        await EmailService.sendWithdrawalAlert(
          session.email || '',
          amount.toString(),
          cryptoToken || 'MATIC',
          checksummedToAddress
        );
      } catch (emailError) {
        console.log('⚠️ [Polygon Send] Email notification failed');
      }

      // Log to audit trail
      try {
        await db.collection('audit_logs').add({
          userId: session.userId,
          action: 'WITHDRAWAL_CONFIRMED',
          details: {
            txHash: txHash,
            amount: amount,
            token: cryptoToken || 'MATIC',
            recipient: checksummedToAddress
          },
          timestamp: new Date(),
          ipAddress: ipAddress
        });
      } catch (auditError) {
        console.log('⚠️ [Polygon Send] Audit log failed');
      }

      return NextResponse.json({
        transactionId,
        txHash: txHash,
        success: true,
        status: 'confirmed',
        explorerUrl: `https://polygonscan.com/tx/${txHash}`
      });

    } catch (error: any) {
      console.log('❌ [Polygon Send] Error:', error.message);

      txRecord.status = 'failed';
      txRecord.error = error.message;
      transactionStore.set(transactionId, txRecord);

      // User-friendly error messages
      let userMessage = 'Transaction failed';
      if (error.message.includes('insufficient funds')) {
        userMessage = 'Insufficient MATIC balance for gas fees';
      } else if (error.message.includes('bad address')) {
        userMessage = 'Invalid recipient address';
      } else if (error.message.includes('timeout')) {
        userMessage = 'Network timeout - please try again';
      }

      return NextResponse.json({
        transactionId,
        success: false,
        error: userMessage,
        message: error.message
      }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to process transaction',
      message: error.message
    }, { status: 500 });
  }
}

// Get transaction status
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
    txHash: txRecord.txHash,
    timestamp: txRecord.timestamp,
    confirmations: txRecord.confirmations,
    error: txRecord.error,
    explorerUrl: txRecord.txHash ? `https://polygonscan.com/tx/${txRecord.txHash}` : undefined
  });
}
