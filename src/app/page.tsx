'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUser } from '@/lib/database';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import MigrationModal from '@/components/MigrationModal';
import { useWeb3Auth } from '@/lib/web3auth/Web3AuthProvider';
import { FaGolfBall } from 'react-icons/fa';

export default function Home() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [legacyUserId, setLegacyUserId] = useState<string | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [agreeNewUser, setAgreeNewUser] = useState(false);
  const [showOldUserModal, setShowOldUserModal] = useState(false);
  const [oldUserEmail, setOldUserEmail] = useState('');
  const [oldUserPassword, setOldUserPassword] = useState('');
  const [oldUserError, setOldUserError] = useState<string | null>(null);
  const [oldUserLoading, setOldUserLoading] = useState(false);
  const router = useRouter();
  const { connect, getUserInfo, isLoading: web3authLoading, web3auth } = useWeb3Auth();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      console.log('Attempting login for user:', userId);
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password })
      });
      const data = await res.json();
      console.log('Login response:', { ...data, private_key: data.private_key ? '[REDACTED]' : null });
      if (res.ok && data.private_key) {
        // --- Block legacy login for migrated users ---
        if (data.auth_email) {
          setShowMigration(false);
          setLegacyUserId(null);
          setError('You have already migrated your wallet. Please sign in with Google.');
          setIsLoading(false);
          return;
        }
        // Only show migration modal for legacy users
        setLegacyUserId(userId);
        setShowMigration(true);
        setIsLoading(false);
        return;
      } else {
        setError(data.error || 'Invalid user ID or password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Defensive: Hide migration modal if error is set
  useEffect(() => {
    if (error) {
      setShowMigration(false);
      setLegacyUserId(null);
    }
  }, [error]);

  // Google sign-in handler (moved to function)
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await connect();
      let email = null;
      if (getUserInfo) {
        const userInfo = await getUserInfo();
        email = userInfo?.email;
      }
      if (email) {
        const res = await fetch('/api/user-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok && data.private_key) {
          sessionStorage.setItem('walletPrivateKey', String(data.private_key));
          router.push('/dashboard');
          return;
        }
      }
      if (web3auth && web3auth.provider) {
        const privateKey = await web3auth.provider.request({ method: 'eth_private_key' });
        if (privateKey) {
          sessionStorage.setItem('walletPrivateKey', String(privateKey));
          router.push('/dashboard');
        } else {
          setError('Failed to retrieve private key from Web3Auth.');
        }
      } else {
        setError('Web3Auth provider not initialized.');
      }
    } catch (err) {
      setError('Google sign-in failed');
    } finally {
      setIsLoading(false);
      setShowGoogleModal(false);
      setAgreeNewUser(false);
    }
  };

  // Old user modal login handler
  const handleOldUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setOldUserLoading(true);
    setOldUserError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: oldUserEmail, password: oldUserPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOldUserError(data.error || '로그인에 실패했습니다.');
        setOldUserLoading(false);
        return;
      }
      if (data.auth_email) {
        setOldUserError('이미 마이그레이션된 계정입니다. Google로 로그인해 주세요.');
        setOldUserLoading(false);
        return;
      }
      if (data.private_key && !data.auth_email) {
        setLegacyUserId(oldUserEmail);
        setShowMigration(true);
        setShowOldUserModal(false);
        setOldUserLoading(false);
        return;
      }
    } catch (err) {
      setOldUserError('로그인에 실패했습니다.');
    } finally {
      setOldUserLoading(false);
    }
  };

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181A20]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--golf-gradient)', padding: '2em 0' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', position: 'relative', boxShadow: '0 8px 32px rgba(46, 125, 50, 0.18)', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', border: '1.5px solid #e6c20022' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <img src="/MZS.png" alt="MZS Logo" style={{ width: 60, height: 60, marginBottom: 4, borderRadius: '50%' }} />
          <h1 style={{ marginBottom: 4, fontWeight: 800, fontSize: '2.2em', color: 'var(--golf-green)' }}>MZS 월렛</h1>
        </div>
        <p style={{ color: 'var(--golf-dark)', marginBottom: 28, fontWeight: 500, fontSize: '1.1em' }}>월렛에 로그인하고 자산을 스타일리시하게 관리하세요.</p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <input
            type="text"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="사용자 아이디"
            required
            style={{ marginBottom: 10 }}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            style={{ marginBottom: 10 }}
          />
          {error && <div style={{ color: 'var(--golf-green)', marginBottom: 8, fontWeight: 600 }}>{error}</div>}
          <button type="submit" className="btn" style={{ fontSize: '1.15em', marginBottom: 8 }} disabled={isLoading}>
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <button
          className="btn w-full flex items-center justify-center"
          style={{
            background: 'var(--golf-btn-gradient)',
            color: 'var(--golf-dark)',
            fontWeight: 700,
            marginTop: 14,
            marginBottom: 10,
            borderRadius: 12,
            fontSize: '1.15em',
            gap: 10,
            boxShadow: 'var(--golf-btn-shadow)',
            minHeight: 48,
            width: '100%',
            maxWidth: '100%'
          }}
          onClick={() => setShowGoogleModal(true)}
          disabled={isLoading}
        >
          <img src="/MZS.png" alt="MZS Logo" style={{ width: 24, height: 24, marginRight: 6, borderRadius: '50%' }} />
          Google로 로그인
        </button>
        <div style={{ marginTop: 18 }}>
          <a href="/forgot-password" style={{ color: 'var(--golf-gold)', fontWeight: 600, fontSize: '1.05em' }}>비밀번호를 잊으셨나요?</a>
        </div>
      </div>
      {/* Google Sign-In Confirmation Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-yellow-400">
            <div className="mb-4 text-2xl font-bold text-yellow-600 flex items-center justify-center gap-2">
              Google 로그인 안내
            </div>
            <div className="mb-2 font-semibold text-yellow-800 text-left" style={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
              MZS 월렛의 보안과 편의성 강화를 위해
              모든 사용자는 앞으로 Google 계정으로만 로그인하실 수 있습니다.

              기존에 아이디와 비밀번호로 로그인하셨던 분들도
              마이그레이션(계정 이전) 절차를 완료하셨다면
              반드시 Google 로그인을 이용해 주세요.

              <b>마이그레이션을 완료한 경우</b>
              더 이상 아이디/비밀번호로 로그인할 수 없으며,
              Google 계정으로만 월렛에 접속하실 수 있습니다.

              <b>아직 마이그레이션을 하지 않은 경우</b>
              먼저 기존 아이디와 비밀번호로 로그인하여
              마이그레이션을 진행해 주세요.
              마이그레이션이 완료되면 Google 로그인을 통해
              월렛을 계속 이용하실 수 있습니다.

              Google 로그인을 통해 더욱 안전하고
              편리하게 자산을 관리하세요.

              <span style={{ fontStyle: 'italic', color: '#bfa100' }}>*아이디/비밀번호 로그인은 더 이상 지원되지 않습니다.*</span>
            </div>
            <div className="flex items-center mt-4 mb-4">
              <input
                type="checkbox"
                id="agreeNewUser"
                checked={agreeNewUser}
                onChange={e => setAgreeNewUser(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="agreeNewUser" className="text-sm">위 안내 메시지를 모두 읽고, Google 로그인을 계속 진행하겠습니다.</label>
            </div>
            <button
              onClick={handleGoogleSignIn}
              disabled={!agreeNewUser || isLoading}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${agreeNewUser ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
            >
              {isLoading ? 'Connecting...' : 'Google로 계속하기'}
            </button>
            <button
              type="button"
              className="w-full mt-2 py-2 px-4 rounded-md border border-yellow-400 text-yellow-800 font-semibold bg-yellow-50 hover:bg-yellow-100"
              onClick={() => { setShowGoogleModal(false); setShowOldUserModal(true); }}
            >
              기존 사용자이신가요? 여기를 클릭
            </button>
            <button
              type="button"
              className="w-full mt-2 py-2 px-4 rounded-md border border-gray-300 text-gray-700 font-semibold bg-gray-50 hover:bg-gray-100"
              onClick={() => { setShowGoogleModal(false); setAgreeNewUser(false); }}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {/* Old User Modal */}
      {showOldUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-yellow-400">
            <div className="mb-4 text-2xl font-bold text-yellow-600 flex items-center justify-center gap-2">
              기존 사용자 로그인
            </div>
            <form onSubmit={handleOldUserLogin} className="space-y-4">
              <input
                type="text"
                placeholder="아이디 또는 이메일"
                value={oldUserEmail}
                onChange={e => setOldUserEmail(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
              <input
                type="password"
                placeholder="비밀번호"
                value={oldUserPassword}
                onChange={e => setOldUserPassword(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  className="text-blue-600 underline text-sm"
                  onClick={() => { setShowOldUserModal(false); router.push('/forgot-password'); }}
                >
                  비밀번호를 잊으셨나요?
                </button>
                <button
                  type="button"
                  className="text-gray-500 text-sm"
                  onClick={() => setShowOldUserModal(false)}
                >
                  취소
                </button>
              </div>
              {oldUserError && <div className="text-red-600 text-sm font-semibold mt-2">{oldUserError}</div>}
              <button
                type="submit"
                className="w-full mt-2 py-2 px-4 rounded-md bg-yellow-500 text-white font-bold hover:bg-yellow-600"
                disabled={oldUserLoading}
              >
                {oldUserLoading ? '로그인 중...' : '로그인'}
              </button>
            </form>
          </div>
        </div>
      )}
      {showMigration && legacyUserId && !error && (
        <MigrationModal
          legacyUserId={legacyUserId}
          onSuccess={async () => {
            setShowMigration(false);
            setLegacyUserId(null);
            setRedirecting(true);
            // Fetch Google email from Web3Auth
            let email = null;
            if (getUserInfo) {
              const userInfo = await getUserInfo();
              email = userInfo?.email;
            }
            if (email) {
              const res = await fetch('/api/user-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
              });
              const data = await res.json();
              if (res.ok && data.private_key) {
                sessionStorage.setItem('walletPrivateKey', String(data.private_key));
              }
            }
            router.push('/dashboard');
          }}
        />
      )}
    </div>
  );
} 