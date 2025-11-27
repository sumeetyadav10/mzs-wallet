'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaLock, FaUser, FaSpinner, FaGolfBall } from 'react-icons/fa';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import AdminOTPModal from '@/components/AdminOTPModal';

export default function AdminLogin() {
  const router = useRouter();
  const { login, verifyMFA } = useAdminAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // OTP Modal state
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [adminId, setAdminId] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loading) return; // Prevent double submission
    
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await login(email, password);
      
      if (result.requiresMFA) {
        setChallengeId(result.challengeId!);
        setAdminId(result.adminId!);
        setShowOTPModal(true);
      } else {
        // Direct login without MFA (shouldn't happen with current setup)
        router.push('/admin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
      setLoading(false); // Only set loading false on error
    }
    // Don't set loading false on success since we're showing OTP modal
  };

  const handleOTPVerify = async (code: string) => {
    try {
      await verifyMFA(challengeId, code);
      setShowOTPModal(false);
      setLoading(false);
      router.push('/admin');
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'OTP 인증에 실패했습니다.');
    }
  };

  const handleCloseOTPModal = () => {
    setShowOTPModal(false);
    setChallengeId('');
    setAdminId('');
    setLoading(false); // Reset loading state if modal is closed
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[var(--golf-gradient)]">
      <div className="golf-pattern absolute inset-0 pointer-events-none"></div>
      
      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-[var(--golf-gold)]/20 border border-[var(--golf-gold)]/30">
                <FaGolfBall className="text-[var(--golf-gold)] text-3xl" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-[var(--golf-green)] mb-2">
              MZS 관리자 로그인
            </h1>
            <p className="text-[var(--golf-dark)]/70 font-medium">
              관리자 전용 패널에 액세스하려면 로그인하세요
            </p>
          </div>

          {/* Login Form */}
          <div className="glass rounded-2xl border border-[var(--golf-gold)]/20 shadow-xl p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-semibold text-[var(--golf-dark)] mb-2">
                  관리자 이메일
                </label>
                <div className="relative">
                  <FaUser className="absolute left-3 top-3 text-[var(--golf-dark)]/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--golf-gold)]/30 bg-white/90 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]/50 focus:border-[var(--golf-gold)] transition-all"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-semibold text-[var(--golf-dark)] mb-2">
                  비밀번호
                </label>
                <div className="relative">
                  <FaLock className="absolute left-3 top-3 text-[var(--golf-dark)]/40" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--golf-gold)]/30 bg-white/90 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]/50 focus:border-[var(--golf-gold)] transition-all"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 font-semibold text-center">
                  {error}
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[var(--golf-gold)] text-[var(--golf-dark)] font-bold hover:bg-[var(--golf-gold)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    인증 중...
                  </>
                ) : (
                  <>
                    <FaLock />
                    관리자 로그인
                  </>
                )}
              </button>
            </form>

            {/* Security Notice */}
            <div className="mt-6 p-4 rounded-xl bg-[var(--golf-green)]/10 border border-[var(--golf-green)]/20">
              <div className="flex items-start gap-3">
                <FaLock className="text-[var(--golf-green)] mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-[var(--golf-green)] mb-1">
                    보안 알림
                  </p>
                  <p className="text-[var(--golf-dark)]/70">
                    로그인 후 추가 보안 인증이 요구됩니다. 이메일로 전송되는 6자리 인증 코드를 준비해주세요.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-6">
            <p className="text-sm text-[var(--golf-dark)]/60">
              © 2024 MZS Wallet Admin Panel
            </p>
          </div>
        </div>
      </div>

      {/* OTP Modal */}
      <AdminOTPModal
        isOpen={showOTPModal}
        onClose={handleCloseOTPModal}
        onVerify={handleOTPVerify}
        challengeId={challengeId}
        email={email}
      />
    </div>
  );
}