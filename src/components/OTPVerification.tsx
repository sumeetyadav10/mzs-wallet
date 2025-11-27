'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// CSS-in-JS for forcing text color - nuclear approach
const otpInputStyles = {
  color: '#000000 !important',
  backgroundColor: '#ffffff !important',
  WebkitTextFillColor: '#000000 !important',
  WebkitTextStrokeColor: '#000000 !important',
  MozTextFillColor: '#000000 !important',
  textShadow: 'none !important',
  filter: 'none !important',
  opacity: '1 !important',
  caretColor: '#000000 !important',
  // Override any parent color inheritance
  fontFamily: 'inherit',
  fontSize: '1.25rem',
  fontWeight: '700'
} as React.CSSProperties;

interface OTPVerificationProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (otpCode: string) => Promise<any>;
  email: string;
  amount: string;
  currency: string;
  toAddress: string;
  blockchain: string;
  loading?: boolean;
  error?: string;
  otpId?: string;
  expiresAt?: string;
}

export default function OTPVerification({
  isOpen,
  onClose,
  onVerify,
  email,
  amount,
  currency,
  toAddress,
  blockchain,
  loading = false,
  error,
  otpId,
  expiresAt
}: OTPVerificationProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [requesting, setRequesting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [currentOtpId, setCurrentOtpId] = useState(otpId || '');
  const [currentExpiresAt, setCurrentExpiresAt] = useState(expiresAt || '');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Calculate time left from currentExpiresAt
  useEffect(() => {
    if (currentExpiresAt) {
      const updateTimer = () => {
        const now = new Date().getTime();
        const expiry = new Date(currentExpiresAt).getTime();
        const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
        setTimeLeft(remaining);
      };

      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [currentExpiresAt]);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setOtpSent(!!otpId); // If otpId is provided, assume code is already sent
      setCurrentOtpId(otpId || '');
      setCurrentExpiresAt(expiresAt || '');
    } else {
      // Reset everything when modal closes
      setOtpSent(false);
      setOtp(['', '', '', '', '', '']);
      setCodeError(null);
      setCurrentOtpId('');
      setCurrentExpiresAt('');
    }
  }, [isOpen, otpId, expiresAt]);

  // Force text color with CSS injection
  useEffect(() => {
    if (isOpen) {
      const style = document.createElement('style');
      style.id = 'otp-force-black-style';
      style.textContent = `
        .otp-input-force-black, 
        .otp-input-force-black:focus, 
        .otp-input-force-black:active, 
        .otp-input-force-black:hover {
          color: #000000 !important;
          background-color: #ffffff !important;
          -webkit-text-fill-color: #000000 !important;
          -webkit-text-stroke-color: #000000 !important;
          -moz-text-fill-color: #000000 !important;
          text-shadow: none !important;
          filter: none !important;
          opacity: 1 !important;
          caret-color: #000000 !important;
          font-size: 1.25rem !important;
          font-weight: 700 !important;
        }
        .otp-input-force-black::placeholder,
        .otp-input-force-black::-webkit-input-placeholder,
        .otp-input-force-black::-moz-placeholder {
          color: #666666 !important;
          opacity: 1 !important;
        }
        /* Override any parent text-white classes */
        .text-white .otp-input-force-black,
        [class*="text-white"] .otp-input-force-black {
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
        }
      `;
      document.head.appendChild(style);

      return () => {
        const existingStyle = document.getElementById('otp-force-black-style');
        if (existingStyle) {
          document.head.removeChild(existingStyle);
        }
      };
    }
  }, [isOpen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleInputChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all fields are filled
    if (newOtp.every(digit => digit !== '') && !loading) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pastedData[i] || '';
    }
    
    setOtp(newOtp);
    
    if (pastedData.length === 6 && !loading) {
      handleVerify(pastedData);
    }
  };

  const handleSendCode = async () => {
    setSendingCode(true);
    setCodeError(null);
    
    try {
      // Get auth token from storage - check both locations
      const sessionToken = sessionStorage.getItem('accessToken');
      const localToken = localStorage.getItem('secure_session_token');
      const authToken = sessionToken || localToken;
      
      if (!authToken) {
        setCodeError('Authentication required - please login again');
        setSendingCode(false);
        return;
      }
      
      const response = await fetch('/api/otp/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency,
          toAddress,
          blockchain
        })
      });

      const data = await response.json();
      if (data.success) {
        setCurrentOtpId(data.otpId);
        setCurrentExpiresAt(data.expiresAt);
        setOtpSent(true);
        setTimeLeft(300); // Reset timer to 5 minutes
        setOtp(['', '', '', '', '', '']); // Clear any previous OTP
      } else {
        setCodeError(data.error || '인증 코드 발송에 실패했습니다');
      }
    } catch (error) {
      // Failed to send OTP
      setCodeError('인증 코드 발송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerify = async (otpCode: string) => {
    if (otpCode.length === 6 && currentOtpId) {
      try {
        // Pass the OTP code directly to the parent's verification handler
        // The parent component (dashboard) will include the otpId in the withdrawal request
        const result = await onVerify(otpCode);
        // The parent component will handle the result
      } catch (error) {
        // OTP verification error
        // Error handling is done by the parent component
      }
    }
  };

  const handleRequestNew = async () => {
    setRequesting(true);
    try {
      // Get auth token from storage - check both locations
      const sessionToken = sessionStorage.getItem('accessToken');
      const localToken = localStorage.getItem('secure_session_token');
      const authToken = sessionToken || localToken;
      
      if (!authToken) {
        throw new Error('Authentication required - please login again');
      }
      
      const response = await fetch('/api/otp/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency,
          toAddress,
          blockchain
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        // Handle rate limiting and other errors
        if (response.status === 429) {
          const errorMsg = data.error || 'Too many requests. Please wait before trying again.';
          alert(errorMsg); // Show rate limit message to user
        } else if (response.status === 401) {
          alert('Session expired. Please login again.');
          window.location.href = '/'; // Redirect to login
        } else {
          alert(data.error || 'Failed to send OTP. Please try again.');
        }
        return;
      }
      
      if (data.success) {
        setOtp(['', '', '', '', '', '']);
        setTimeLeft(300);
        alert('New OTP sent to your email!');
      }
    } catch (error) {
      // Failed to request new OTP
      alert(error instanceof Error ? error.message : 'Failed to send OTP');
    } finally {
      setRequesting(false);
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white/20 dark:bg-[#23262F]/90 backdrop-blur-2xl rounded-3xl shadow-2xl border border-[#1aDb749F] p-8 m-4 max-w-md w-full relative"
        >
          <button className="absolute top-4 right-4 text-white text-2xl" onClick={onClose} aria-label="Close">&times;</button>
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-[#1aDb749F] rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-[#16a085] p-2">
              <span className="text-white font-bold text-xl">MZS</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">이메일 인증</h2>
            <p className="text-white text-sm">
              다음 주소로 발송된 6자리 코드를 입력하세요<br />
              <span className="font-medium">{email}</span>
            </p>
          </div>

          {/* Transaction Details */}
          <div className="bg-[#181A20] border border-[#2C2F36] rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-white mb-3">출금 상세정보</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white">금액:</span>
                <span className="font-medium text-white">{amount} {currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white">네트워크:</span>
                <span className="font-medium text-white capitalize">{blockchain}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white">받는 주소:</span>
                <span className="font-medium font-mono text-xs text-white">{truncateAddress(toAddress)}</span>
              </div>
            </div>
          </div>

          {!otpSent ? (
            /* Step 1: Send Code Button */
            <div className="text-center mb-6">
              <p className="text-white mb-4">이메일로 인증 코드를 받으려면 아래 버튼을 클릭하세요</p>
              
              {/* Error Message for Send Code */}
              {codeError && (
                <div className="bg-red-500/20 border border-red-400 rounded-lg p-3 mb-4">
                  <p className="text-red-300 text-sm text-center">{codeError}</p>
                </div>
              )}

              <button
                onClick={handleSendCode}
                disabled={sendingCode}
                className="w-full py-3 bg-[#1aDb749F] text-black font-bold rounded-lg hover:bg-[#16a085] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {sendingCode ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2"></div>
                    코드 발송 중...
                  </div>
                ) : (
                  '인증 코드 발송'
                )}
              </button>
            </div>
          ) : (
            /* Step 2: OTP Input Fields */
            <div>
              <p className="text-white text-center mb-4">이메일로 발송된 6자리 코드를 입력하세요:</p>

              {/* OTP Input */}
              <div className="mb-6">
                <div className="flex justify-center space-x-3 mb-4">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleInputChange(index, e.target.value)}
                      onKeyDown={e => handleKeyDown(index, e)}
                      onPaste={handlePaste}
                      className="otp-input-force-black w-12 h-12 text-center text-xl font-bold border-2 border-[#2C2F36] rounded-lg focus:border-[#1aDb749F] focus:outline-none transition-colors"
                      style={otpInputStyles}
                      disabled={loading}
                    />
                  ))}
                </div>

                {/* Timer */}
                <div className="text-center">
                  {timeLeft > 0 ? (
                    <p className="text-sm text-white">
                      코드 만료까지 <span className="font-medium text-[#1aDb749F]">{formatTime(timeLeft)}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-red-400 font-medium">코드가 만료되었습니다</p>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/20 border border-red-400 rounded-lg p-3 mb-4">
                  <p className="text-red-300 text-sm text-center">{error}</p>
                </div>
              )}

              {/* Action Buttons for Step 2 */}
              <div className="flex flex-col space-y-3">
                <button
                  onClick={() => handleVerify(otp.join(''))}
                  disabled={otp.some(digit => !digit) || loading || timeLeft === 0}
                  className="w-full py-3 bg-[#1aDb749F] text-black font-bold rounded-lg hover:bg-[#16a085] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2"></div>
                      인증 중...
                    </div>
                  ) : (
                    '인증 후 전송'
                  )}
                </button>

                <div className="flex space-x-3">
                  <button
                    onClick={handleRequestNew}
                    disabled={requesting || timeLeft > 240} // Can request new after 1 minute
                    className="flex-1 py-2 text-[#1aDb749F] font-bold hover:bg-[#181A20] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {requesting ? '발송 중...' : '코드 재발송'}
                  </button>
                  <button
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 py-2 text-white font-medium hover:bg-[#181A20] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cancel Button for Step 1 */}
          {!otpSent && (
            <div className="mt-4">
              <button
                onClick={onClose}
                className="w-full py-2 text-white font-medium hover:bg-[#181A20] rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          )}

          {/* Security Notice */}
          <div className="mt-6 p-3 bg-red-500/20 border border-red-400 rounded-lg">
            <div className="flex items-start">
              <span className="text-red-300 mr-2 font-bold">!</span>
              <div>
                <p className="text-xs text-red-300 font-bold">
                  <strong>보안 알림:</strong> 이 코드를 누구와도 공유하지 마세요. 
                  MZS 지원팀은 절대 인증 코드를 요청하지 않습니다.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}