"use client";
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/store/WalletContext';
import Navigation from '@/components/Navigation';
import { motion } from 'framer-motion';
import { useWeb3Auth } from '@/lib/web3auth/Web3AuthProvider';
import BottomNav from '@/components/BottomNav';
import { FaGolfBall, FaFlagCheckered, FaCog } from 'react-icons/fa';

export default function Settings() {
  const router = useRouter();
  const { wallet, resetWallet } = useWallet();
  const { disconnect } = useWeb3Auth();
  const [showExport, setShowExport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await disconnect();
      sessionStorage.removeItem('walletPrivateKey');
      resetWallet();
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPrivateKey = () => {
    if (wallet && 'privateKey' in wallet) {
      setShowExport(true);
      setExportError(null);
    } else {
      setExportError('Wallet not loaded.');
    }
  };

  const handleBackupWallet = () => {
    if (wallet && 'privateKey' in wallet) {
      const blob = new Blob([
        `Wallet Backup\n\n` +
        `Date: ${new Date().toLocaleString()}\n` +
        `Network: Polygon Mainnet\n` +
        `Address: ${wallet.address}\n` +
        `Private Key: ${wallet.privateKey}\n\n` +
        `IMPORTANT: Keep this file safe and secure!\n` +
        `Anyone with access to your private key can access your funds.\n` +
        `Never share your private key with anyone.\n` +
        `Store this backup in a secure location.`
      ], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      if (downloadRef.current) {
        downloadRef.current.href = url;
        downloadRef.current.download = `wallet-backup-${wallet.address}.txt`;
        downloadRef.current.click();
        setExportError(null);
      }
    } else {
      setExportError('Wallet not loaded.');
    }
  };

  const handleClearWallet = async () => {
    if (confirm('Are you sure you want to clear your wallet? This will remove it from this device but not from the blockchain.')) {
      try {
        setIsLoading(true);
        sessionStorage.removeItem('walletPrivateKey');
        resetWallet();
        router.push('/');
      } catch (error) {
        console.error('Error clearing wallet:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div style={{ minHeight: '80vh', background: 'var(--golf-gradient)', borderRadius: '18px', boxShadow: 'var(--golf-shadow)', padding: '2em 0' }}>
      <div className="card" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', position: 'relative', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1.5px solid #e6c20022', boxShadow: '0 8px 32px rgba(46, 125, 50, 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
          <FaCog size={36} color="var(--golf-gold)" />
          <h2 style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: '2rem', margin: 0 }}>설정</h2>
        </div>
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: 'var(--golf-green)', fontWeight: 600, marginBottom: 12 }}>네트워크</h3>
          <div style={{ background: 'var(--golf-accent)', borderRadius: 12, padding: '1em', marginBottom: 16, color: 'var(--golf-dark)', fontWeight: 600 }}>
            Polygon Mainnet<br />
            <span style={{ fontSize: 12, color: 'var(--golf-green)' }}>RPC: {process.env.NEXT_PUBLIC_POLYGON_RPC_URL}</span>
          </div>
        </div>
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: 'var(--golf-green)', fontWeight: 600, marginBottom: 12 }}>보안</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={handleExportPrivateKey} className="btn" style={{ background: 'var(--golf-gold)', color: 'var(--golf-dark)' }}>개인키 내보내기</button>
            <button onClick={handleBackupWallet} className="btn" style={{ background: 'var(--golf-green)', color: 'var(--golf-white)' }}>월렛 백업</button>
            <button onClick={handleClearWallet} className="btn" style={{ background: 'red', color: 'var(--golf-white)' }}>기기에서 월렛 삭제</button>
          </div>
        </div>
        {showExport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="card" style={{ maxWidth: 400, background: 'var(--golf-white)', color: 'var(--golf-dark)' }}>
              <h3 style={{ color: 'var(--golf-green)', fontWeight: 700, marginBottom: 12 }}>개인키 내보내기</h3>
              <p style={{ fontSize: 14, color: 'var(--golf-gold)', marginBottom: 12 }}>경고: 절대 개인키를 공유하지 마세요. 개인키를 알면 누구나 자산에 접근할 수 있습니다.</p>
              {wallet && 'privateKey' in wallet && (
                <div style={{ background: 'var(--golf-accent)', borderRadius: 8, padding: '1em', marginBottom: 12, fontFamily: 'monospace', fontSize: 14 }}>{showPrivateKey ? wallet.privateKey : '••••••••••••••••••••••••••••••••'}</div>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowPrivateKey(!showPrivateKey)} className="btn" style={{ background: 'var(--golf-green)', color: 'var(--golf-white)' }}>{showPrivateKey ? '숨기기' : '보기'} Private Key</button>
                <button onClick={() => setShowExport(false)} className="btn" style={{ background: 'var(--golf-gold)', color: 'var(--golf-dark)' }}>닫기</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', width: '100%' }}>
          <button
            className="btn"
            style={{ width: '90%', maxWidth: 340, height: 48, background: 'var(--golf-gold)', color: 'var(--golf-dark)', fontWeight: 700, borderRadius: 14, fontSize: 17, boxShadow: '0 2px 8px #e6c20011', letterSpacing: 0.2 }}
            onClick={handleLogout}
            disabled={isLoading}
          >
            {isLoading ? '로그아웃 중...' : '로그아웃'}
          </button>
        </div>
        {exportError && <div style={{ color: 'red', marginTop: 12 }}>{exportError}</div>}
      </div>
      <BottomNav />
    </div>
  );
} 