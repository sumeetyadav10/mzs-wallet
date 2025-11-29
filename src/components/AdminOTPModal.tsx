'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FaLock, FaSpinner, FaTimes } from 'react-icons/fa';

interface AdminOTPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (code: string) => Promise<void>;
  challengeId: string;
  email: string;
}

export default function AdminOTPModal({ 
  isOpen, 
  onClose, 
  onVerify, 
  challengeId, 
  email 
}: AdminOTPModalProps) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    if (isOpen && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [isOpen]);

  const handleInputChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newCode = code.split('');
    newCode[index] = value;
    const updatedCode = newCode.join('');
    setCode(updatedCode);
    
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    
    if (updatedCode.length === 6) {
      handleSubmit(updatedCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (otpCode?: string) => {
    const codeToSubmit = otpCode || code;
    if (codeToSubmit.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setVerifying(true);
    setError(null);
    
    try {
      await onVerify(codeToSubmit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="glass w-full max-w-md rounded-2xl border border-[var(--golf-gold)]/30 shadow-2xl"
        onClick={handleModalClick}
      >
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-[var(--golf-gold)]/20">
                <FaLock className="text-[var(--golf-gold)]" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--golf-green)]">
                  관리자 인증
                </h2>
                <p className="text-[var(--golf-dark)]/70 text-sm">
                  이메일로 전송된 코드를 입력하세요
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--golf-gold)]/20 transition-colors"
            >
              <FaTimes className="text-[var(--golf-dark)]/60" />
            </button>
          </div>

          {/* Email Display */}
          <div className="mb-6 p-3 rounded-xl bg-[var(--golf-gold)]/10 border border-[var(--golf-gold)]/20">
            <p className="text-sm text-[var(--golf-dark)]/70">인증 코드가 다음 이메일로 전송되었습니다:</p>
            <p className="font-semibold text-[var(--golf-green)]">{email}</p>
          </div>

          {/* OTP Input */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-[var(--golf-dark)] mb-3">
              6자리 인증 코드
            </label>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: 6 }).map((_, index) => (
                <input
                  key={index}
                  ref={el => {
                    if (el) inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={1}
                  className="w-12 h-12 text-center text-xl font-bold border-2 border-[#2C2F36] bg-[#181A20] text-white rounded-lg focus:border-[#1aDb749F] focus:outline-none transition-colors"
                  value={code[index] || ''}
                  onChange={e => handleInputChange(index, e.target.value)}
                  onKeyDown={e => handleKeyDown(index, e)}
                  disabled={verifying}
                />
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-center font-semibold">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={() => handleSubmit()}
            disabled={code.length !== 6 || verifying}
            className="w-full py-3 px-4 rounded-xl bg-[var(--golf-gold)] text-[var(--golf-dark)] font-bold hover:bg-[var(--golf-gold)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {verifying ? (
              <>
                <FaSpinner className="animate-spin" />
                인증 중...
              </>
            ) : (
              '인증하기'
            )}
          </button>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[var(--golf-dark)]/60">
              코드를 받지 못하셨나요?{' '}
              <button className="text-[var(--golf-gold)] hover:underline font-semibold">
                다시 발송
              </button>
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}