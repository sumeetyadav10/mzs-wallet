"use client";
import { useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);

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


  const handleClearWallet = async () => {
    if (confirm('지갑을 삭제하시겠습니까? 이 기기에서만 제거되며 블록체인에서는 제거되지 않습니다.')) {
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
            <button onClick={handleClearWallet} className="btn" style={{ background: 'red', color: 'var(--golf-white)' }}>기기에서 월렛 삭제</button>
          </div>
        </div>
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
      </div>
      <BottomNav />
    </div>
  );
} 