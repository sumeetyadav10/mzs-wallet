'use client';
import { useState } from 'react';

interface WithdrawalRequest {
  amount: number;
  currency: string;
  toAddress: string;
  blockchain: 'solana' | 'tron' | 'polygon';
  encryptedPrivateKey: string;
}

interface OTPData {
  otpId: string;
  expiresAt: string;
  requiresOTP: boolean;
}

interface WithdrawalResult {
  success: boolean;
  signature?: string;
  txHash?: string;
  transactionId?: string;
  explorerUrl?: string;
  error?: string;
}

export const useSecureWithdrawal = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpData, setOtpData] = useState<OTPData | null>(null);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<WithdrawalRequest | null>(null);

  const generateOTP = async (request: WithdrawalRequest): Promise<OTPData | null> => {
    try {
      setError(null);
      
      // DEBUG: Check all possible token locations
      const sessionToken = sessionStorage.getItem('accessToken');
      const secureSessionToken = sessionStorage.getItem('secure_session_token');
      const localToken = localStorage.getItem('secure_session_token');
      const authMethod = sessionStorage.getItem('authMethod');
      
      // Token verification (reduced logging for performance)
      if (!secureSessionToken && !sessionToken && !localToken) {
        console.warn('⚠️ No authentication tokens found');
      }
      
      // Token check - prioritize secure session tokens
      const authToken = secureSessionToken || sessionToken || localToken;
      if (!authToken) {
        // Check if user has wallet data but missing session token
        const hasWallet = !!sessionStorage.getItem('walletPrivateKey');
        const hasUserInfo = !!localStorage.getItem('userInfo');
        
        if (hasWallet && hasUserInfo) {
          throw new Error('Session expired - please refresh the page or log in again');
        } else {
          throw new Error('Authentication required - please log in');
        }
      }

      const response = await fetch('/api/otp/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          amount: request.amount,
          currency: request.currency,
          toAddress: request.toAddress,
          blockchain: request.blockchain
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate OTP');
      }

      if (!data.requiresOTP) {
        return { otpId: '', expiresAt: '', requiresOTP: false };
      }

      return {
        otpId: data.otpId,
        expiresAt: data.expiresAt,
        requiresOTP: true
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate OTP');
      return null;
    }
  };

  const executeWithdrawal = async (
    request: WithdrawalRequest, 
    otpCode?: string,
    otpId?: string
  ): Promise<WithdrawalResult | null> => {
    try {
      setLoading(true);
      setError(null);

      const authToken = sessionStorage.getItem('secure_session_token') || sessionStorage.getItem('accessToken') || localStorage.getItem('secure_session_token');
      if (!authToken) {
        throw new Error('Authentication required');
      }

      const payload: any = {
        encryptedPrivateKey: request.encryptedPrivateKey,
        toAddress: request.toAddress,
        amount: request.amount
      };

      if (request.currency !== 'SOL' && request.currency !== 'TRX') {
        payload.token = request.currency;
      }

      // Include OTP data if provided
      if (otpCode && (otpId || otpData?.otpId)) {
        payload.otpCode = otpCode;
        payload.otpId = otpId || otpData?.otpId;
      }

      const response = await fetch(`/api/${request.blockchain}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        // If OTP is required, show the OTP modal
        if (data.requiresOTP) {
          setPendingWithdrawal(request);
          const otpResponse = await generateOTP(request);
          if (otpResponse) {
            setOtpData(otpResponse);
            if (otpResponse.requiresOTP) {
              setShowOTPModal(true);
              return null; // Wait for OTP input
            }
          }
        }
        
        throw new Error(data.error || data.message || 'Transaction failed');
      }

      if (!data.success) {
        throw new Error(data.error || 'Transaction failed');
      }

      // Clear OTP data after successful transaction
      setOtpData(null);
      setPendingWithdrawal(null);
      setShowOTPModal(false);

      return {
        success: true,
        signature: data.signature,
        txHash: data.txHash,
        transactionId: data.transactionId,
        explorerUrl: data.explorerUrl
      };

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Transaction failed'
      };
    } finally {
      setLoading(false);
    }
  };

  const initiateWithdrawal = async (request: WithdrawalRequest): Promise<WithdrawalResult | null> => {
    // Always set up the withdrawal request first
    setPendingWithdrawal(request);
    
    // Try to generate OTP automatically
    const otpResponse = await generateOTP(request);
    
    if (otpResponse) {
      setOtpData(otpResponse);
      
      if (!otpResponse.requiresOTP) {
        // Execute withdrawal immediately if no OTP required
        return await executeWithdrawal(request);
      }
    }

    // Show OTP modal (either for successful OTP or for manual retry)
    setShowOTPModal(true);
    return null;
  };

  const handleOTPSubmit = async (otpCode: string): Promise<WithdrawalResult | null> => {
    if (!pendingWithdrawal) {
      setError('No pending withdrawal found');
      return null;
    }

    // Pass the OTP ID along with the code
    const result = await executeWithdrawal(pendingWithdrawal, otpCode, otpData?.otpId);
    
    if (result?.success) {
      setShowOTPModal(false);
      setPendingWithdrawal(null);
      setOtpData(null);
    }
    
    return result;
  };

  const cancelOTP = () => {
    setShowOTPModal(false);
    setPendingWithdrawal(null);
    setOtpData(null);
    setError(null);
  };

  return {
    loading,
    error,
    otpData,
    showOTPModal,
    pendingWithdrawal,
    initiateWithdrawal,
    handleOTPSubmit,
    cancelOTP,
    setError
  };
};