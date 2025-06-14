'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/store/WalletContext';
import { ethers } from 'ethers';
import { FaGolfBall, FaFlagCheckered } from 'react-icons/fa';
import BottomNav from '@/components/BottomNav';

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  tokenSymbol?: string;
  tokenName?: string;
}

export default function Profile() {
  const router = useRouter();
  const { wallet, address } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!wallet || !address) {
      router.push('/');
    }
  }, [wallet, address, router]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!address) return;
      try {
        // Fetch both native and token transfers
        const [nativeTxs, tokenTxs] = await Promise.all([
          fetch(`https://api.polygonscan.com/api?module=account&action=txlist&address=${address}&sort=desc&apikey=JZB52EQ9Z4Z4AYMVSRM5PP3ERUJ2891I4R`).then(res => res.json()),
          fetch(`https://api.polygonscan.com/api?module=account&action=tokentx&address=${address}&sort=desc&apikey=JZB52EQ9Z4Z4AYMVSRM5PP3ERUJ2891I4R`).then(res => res.json())
        ]);

        const nativeTransactions = nativeTxs.status === "1" && nativeTxs.result ? nativeTxs.result.map((tx: any) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: ethers.formatEther(tx.value),
          timestamp: Number(tx.timeStamp),
          status: tx.isError === "1" ? 'failed' : 'success',
          tokenSymbol: 'MATIC',
          tokenName: 'Polygon'
        })) : [];

        const tokenTransactions = tokenTxs.status === "1" && tokenTxs.result ? tokenTxs.result.map((tx: any) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: ethers.formatUnits(tx.value, Number(tx.tokenDecimal)),
          timestamp: Number(tx.timeStamp),
          status: tx.isError === "1" ? 'failed' : 'success',
          tokenSymbol: tx.tokenSymbol,
          tokenName: tx.tokenName
        })) : [];

        // Combine and sort all transactions by timestamp
        const allTransactions = [...nativeTransactions, ...tokenTransactions]
          .sort((a, b) => b.timestamp - a.timestamp);

        setTransactions(allTransactions);
        setError(null);
      } catch (error) {
        setError('Failed to fetch transactions. Please try again later.');
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
    // Refresh transactions every 30 seconds
    const interval = setInterval(fetchTransactions, 30000);
    return () => clearInterval(interval);
  }, [address]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--golf-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2em 0' }}>
      <div className="card glass" style={{ maxWidth: 500, width: '100%', margin: '0 16px', textAlign: 'center', position: 'relative', background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)', border: '1.5px solid #e6c20022', boxShadow: '0 8px 32px rgba(46, 125, 50, 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
          <FaFlagCheckered size={36} color="var(--golf-gold)" />
          <h2 style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: '2rem', margin: 0 }}>골프 스코어카드</h2>
        </div>
        <div style={{ marginTop: 16 }}>
          <h3 style={{ color: 'var(--golf-green)', fontWeight: 600, marginBottom: 12 }}>거래 내역</h3>
          {error && (
            <div style={{ color: 'red', fontWeight: 600 }}>{error}</div>
          )}
          {isLoading ? (
            <div style={{ padding: '2em 0' }}><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--golf-accent)]"></div></div>
          ) : transactions.length > 0 ? (
            <>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(showAll ? transactions : transactions.slice(0, 5)).map((tx, idx) => {
                  const isSent = tx.from.toLowerCase() === address?.toLowerCase();
                  return (
                    <li key={tx.hash} style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--golf-dark)', borderRadius: 14, marginBottom: 10, padding: '1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600, boxShadow: '0 2px 8px #e6c20011' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isSent ? <FaFlagCheckered size={20} color="var(--golf-gold)" /> : <FaGolfBall size={20} color="var(--golf-green)" />} {isSent ? '보냄' : '받음'}
                      </span>
                      <span style={{ color: isSent ? 'var(--golf-gold)' : 'var(--golf-green)', fontFamily: 'monospace', fontSize: 15 }}>{isSent ? '-' : '+'}{Number(tx.value).toLocaleString(undefined, { maximumFractionDigits: 4 })} {tx.tokenSymbol}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, borderRadius: 8, padding: '0.2em 0.8em', background: isSent ? 'rgba(230,194,0,0.12)' : 'rgba(46,125,50,0.12)', color: isSent ? 'var(--golf-gold)' : 'var(--golf-green)', border: isSent ? '1px solid #e6c20022' : '1px solid #2e7d3222' }}>{new Date(tx.timestamp * 1000).toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
              {transactions.length > 5 && !showAll && (
                <button className="btn" style={{ marginTop: 12, width: '100%', background: 'var(--golf-gold)', color: 'var(--golf-dark)', borderRadius: 12, fontWeight: 700 }} onClick={() => setShowAll(true)}>Show More</button>
              )}
              {showAll && transactions.length > 5 && (
                <button className="btn" style={{ marginTop: 12, width: '100%', background: 'var(--golf-accent)', color: 'var(--golf-dark)', borderRadius: 12, fontWeight: 700 }} onClick={() => setShowAll(false)}>Show Less</button>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--golf-gold)', fontWeight: 500 }}>아직 거래가 없습니다.</div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
} 