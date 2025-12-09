import { NextRequest, NextResponse } from 'next/server';
// import { logger } from '@/lib/logger'; // Removed for production
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
    // PURE Web3Auth JWT verification - NO FALLBACKS
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
      
      // Polygon transaction initiated (session verified from database)
    } catch (error) {
      // Session validation failed for Polygon transaction
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

    // OTP Validation is REQUIRED for ALL withdrawals
    const { db } = await import('@/lib/firebase-admin');
    const crypto = await import('crypto');
    
    // All withdrawals require OTP verification for maximum security
    if (true) {
      if (!otpCode || !otpId) {
        return NextResponse.json({
          error: 'OTP verification required',
          message: 'All withdrawals require email verification for security',
          requiresOTP: true
        }, { status: 400 });
      }
      
      // Fetch OTP record
      const otpDoc = await db.collection('otp_codes').doc(otpId).get();
      
      if (!otpDoc.exists) {
        // Temporary debug info
        return NextResponse.json({
          error: 'OTP validation failed',
          message: 'Invalid or expired verification code',
          debug: process.env.NODE_ENV === 'development' ? {
            otpId: otpId,
            exists: false,
            message: 'OTP document not found'
          } : undefined
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
          message: 'Verification code has already been used'
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
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
      });
    }
    
    // Create transaction record
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const txRecord: TransactionRecord = {
      id: transactionId,
      status: 'pending',
      fromAddress: '', // Will be filled after processing
      toAddress,
      amount,
      token: cryptoToken,
      timestamp: Date.now(),
      confirmations: 0
    };
    
    transactionStore.set(transactionId, txRecord);
    
    try {
      // Handle private key - check if it's already raw first
      let privateKey: string;
      
      // FIRST check if it's already a valid private key format (hex string starting with 0x)
      if (encryptedPrivateKey.startsWith('0x') && encryptedPrivateKey.length === 66) {
        // It's already a raw private key, use it directly
        privateKey = encryptedPrivateKey;
        // Private key is already in raw format, using directly
      } else {
        // Only try decryption if it's NOT already a raw key
        // For MZS wallet, private keys might be stored in raw form
        // Check if it's a raw key without 0x prefix
        if (encryptedPrivateKey.length === 64 && /^[a-fA-F0-9]+$/.test(encryptedPrivateKey)) {
          // Raw key without 0x prefix
          privateKey = '0x' + encryptedPrivateKey;
        } else {
          // Try decryption only if environment is properly configured
          try {
            // Dynamically import to avoid initialization errors
            const cryptoModule = await import('@/lib/crypto').catch(() => null);
            if (cryptoModule && cryptoModule.decrypt) {
              privateKey = cryptoModule.decrypt(encryptedPrivateKey);
            } else {
              // If crypto module fails, assume it's base64 encoded
              privateKey = Buffer.from(encryptedPrivateKey, 'base64').toString('utf-8');
            }
          } catch (error) {
            // Final fallback - assume it's already a raw key
            privateKey = encryptedPrivateKey;
          }
        }
      }
      
      // Setup Polygon provider with fallback RPC endpoints
      const rpcUrls = [
        process.env.POLYGON_RPC_URL,
        process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
        'https://polygon-rpc.com',
        'https://rpc-mainnet.maticvigil.com',
        'https://matic-mainnet.chainstacklabs.com',
        'https://rpc-mainnet.matic.quiknode.pro'
      ].filter(Boolean);
      
      let provider: ethers.JsonRpcProvider | null = null;
      let lastError: any = null;
      
      // Try each RPC endpoint until one works
      for (const rpcUrl of rpcUrls) {
        try {
          const testProvider = new ethers.JsonRpcProvider(rpcUrl);
          
          // Test the connection
          await testProvider.getBlockNumber();
          provider = testProvider;
          // Connected to RPC
          break;
        } catch (error) {
          // Failed to connect to this RPC
          lastError = error;
          continue;
        }
      }
      
      if (!provider) {
        throw new Error(`Cannot connect to any Polygon RPC endpoint. Last error: ${lastError?.message}`);
      }
      
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // CRITICAL FIX: Ensure proper address checksum
      // This handles both checksummed and non-checksummed addresses
      let checksummedToAddress: string;
      try {
        // ethers.getAddress will validate and return checksummed address
        checksummedToAddress = ethers.getAddress(toAddress);
        // Address checksummed
      } catch (addressError) {
        // Invalid Ethereum address
        return NextResponse.json({
          error: 'Invalid recipient address',
          message: 'Please provide a valid Ethereum address'
        }, { status: 400 });
      }
      
      // Check if recipient is a contract
      const recipientCode = await provider.getCode(checksummedToAddress);
      const isContract = recipientCode !== '0x';
      
      if (isContract) {
        // Log that recipient is a contract (for debugging)
        // Warning: Sending to contract address - may require more gas
      }
      
      let txHash: string;
      
      if (cryptoToken === 'MATIC' || !cryptoToken) {
        // Native MATIC transfer
        // Sending MATIC
        
        // Estimate gas for the transaction
        const transaction = {
          to: checksummedToAddress,
          value: ethers.parseEther(amount.toString())
        };
        
        // Let ethers estimate the gas limit
        const estimatedGas = await provider.estimateGas({
          ...transaction,
          from: wallet.address
        });
        
        // Add 20% buffer to gas estimate for safety
        const gasLimit = estimatedGas * BigInt(120) / BigInt(100);
        
        const tx = await wallet.sendTransaction({
          ...transaction,
          gasLimit
        });
        txHash = tx.hash;
        
        // Polygon MATIC transaction sent
        
        // Wait for transaction confirmation
        const receipt = await tx.wait(1);
        
        // Check if transaction failed
        if (receipt && receipt.status === 0) {
          throw new Error('Transaction failed on chain');
        }
        
      } else {
        // ERC-20 token transfer
        // Sending ERC-20 token
        
        // Get token contract address
        let tokenAddress: string;
        if (cryptoToken === 'GPTCH') {
          tokenAddress = '0x7Efe72a61ee1Cd8De6DA40f071287328D11034e9';
        } else if (cryptoToken === 'MZS') {
          // MZS token contract address on Polygon
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
        
        // Ensure token address is also checksummed
        const checksummedTokenAddress = ethers.getAddress(tokenAddress);
        
        // Create ERC-20 contract instance
        const tokenABI = [
          "function transfer(address to, uint256 amount) returns (bool)",
          "function decimals() view returns (uint8)",
          "function balanceOf(address account) view returns (uint256)"
        ];
        const tokenContract = new ethers.Contract(checksummedTokenAddress, tokenABI, wallet);
        
        // Get token decimals and format amount
        const decimals = await tokenContract.decimals();
        const transferAmount = ethers.parseUnits(amount.toString(), decimals);
        
        // Check token balance before transfer
        const balance = await tokenContract.balanceOf(wallet.address);
        if (balance < transferAmount) {
          // Insufficient token balance
          return NextResponse.json({
            error: 'Insufficient token balance',
            message: `You don't have enough ${cryptoToken} tokens to complete this transfer`
          }, { status: 400 });
        }
        
        // Execute ERC-20 transfer
        const tx = await tokenContract.transfer(checksummedToAddress, transferAmount, {
          gasLimit: BigInt(100000) // Higher gas limit for ERC-20 transfers
        });
        txHash = tx.hash;
        
        // Polygon token transaction sent
        
        // Wait for transaction confirmation
        await tx.wait(1);
      }
      
      // Update transaction record with real hash
      txRecord.txHash = txHash;
      txRecord.status = 'confirmed';
      txRecord.confirmations = 1;
      txRecord.fromAddress = wallet.address;
      transactionStore.set(transactionId, txRecord);
      
      // Send withdrawal notification email for successful withdrawals
      try {
        const { EmailService } = await import('@/lib/email-service');
        await EmailService.sendWithdrawalAlert(
          session.email || '',
          amount.toString(),
          cryptoToken || 'MATIC',
          checksummedToAddress
        );
      } catch (emailError) {
        // Log email error but don't fail the transaction
        // Failed to send withdrawal alert
      }
      
      return NextResponse.json({
        transactionId,
        txHash: txHash,
        success: true,
        status: 'confirmed',
        explorerUrl: `https://polygonscan.com/tx/${txHash}`
      });
      
    } catch (error: any) {
      // Polygon transaction execution error
      
      txRecord.status = 'failed';
      txRecord.error = error.message;
      transactionStore.set(transactionId, txRecord);
      
      // Transaction failed - error details in error.message
      
      // Provide more detailed error messages for common issues
      let userMessage = 'Transaction failed';
      if (error.message.includes('insufficient funds')) {
        userMessage = 'Insufficient MATIC balance for gas fees';
      } else if (error.message.includes('UNPREDICTABLE_GAS_LIMIT')) {
        userMessage = 'Transaction would fail. The recipient address might be a contract that rejects the transfer';
      } else if (error.message.includes('bad address checksum')) {
        userMessage = 'Invalid recipient address format';
      } else if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
        userMessage = 'Network timeout - please try again';
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        userMessage = 'Cannot connect to Polygon network - please try again';
      } else if (error.message.includes('Transaction failed on chain')) {
        userMessage = 'Transaction was rejected by the network. The recipient might be a contract that cannot receive MATIC';
      } else if (error.message.includes('cannot estimate gas')) {
        userMessage = 'Unable to estimate gas. The recipient address might not be able to receive funds';
      }
      
      return NextResponse.json({
        transactionId,
        success: false,
        error: userMessage,
        message: error.message || userMessage,
        details: {
          originalError: error.message,
          code: error.code,
          reason: error.reason
        }
      }, { status: 500 });
    }
    
  } catch (error: any) {
    // Polygon send error
    
    // Check for specific network errors
    let errorMessage = 'Failed to process transaction';
    if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      errorMessage = 'Network timeout - Polygon RPC not responding';
    } else if (error.message?.includes('fetch failed')) {
      errorMessage = 'Network error - please check your connection';
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      message: error.message || errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        error: error.message,
        cause: error.cause,
        code: error.cause?.code
      } : undefined
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