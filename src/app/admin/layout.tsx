'use client';

import { AdminAuthProvider, useAdminAuth } from '@/lib/AdminAuthContext';
import { useState } from 'react';
import { FaGolfBall, FaSpinner } from 'react-icons/fa';

function AdminLoginForm() {
  const { login, loading } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--golf-gradient)]">
      <div className="golf-pattern absolute inset-0 pointer-events-none"></div>
      <div className="relative z-10 glass rounded-2xl border border-[var(--golf-gold)]/20 p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <FaGolfBall size={48} className="text-[var(--golf-gold)] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[var(--golf-green)]">관리자 로그인</h1>
          <p className="text-[var(--golf-dark)]/70 mt-2">MZS 관리자 패널에 접속하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[var(--golf-green)] mb-2">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full glass px-4 py-3 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)] focus:border-transparent"
              placeholder="admin@mzswallet.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--golf-green)] mb-2">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full glass px-4 py-3 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)] focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-semibold text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full glass px-6 py-3 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold hover:bg-[var(--golf-gold)]/10 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <FaSpinner className="animate-spin" />
                로그인 중...
              </>
            ) : (
              '로그인'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminContent({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading, logout } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--golf-gradient)]">
        <div className="golf-pattern absolute inset-0 pointer-events-none"></div>
        <div className="relative z-10 text-center">
          <FaSpinner className="animate-spin text-[var(--golf-gold)] mx-auto mb-4" size={48} />
          <div className="text-[var(--golf-dark)] font-semibold text-lg">인증 확인 중...</div>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <AdminLoginForm />;
  }

  return (
    <div className="relative">
      {/* Logout Button */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={logout}
          className="glass px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold hover:bg-[var(--golf-gold)]/10 transition-all duration-200"
        >
          로그아웃
        </button>
      </div>
      {children}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminContent>
        {children}
      </AdminContent>
    </AdminAuthProvider>
  );
} 