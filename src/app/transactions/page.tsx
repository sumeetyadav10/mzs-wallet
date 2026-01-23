"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useWallet } from "@/store/WalletContext";
import { ethers } from "ethers";
import { motion } from "framer-motion";
import BottomNav from '@/components/BottomNav';
import { FaGolfBall, FaFlagCheckered } from 'react-icons/fa';

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  status: string;
  timestamp: number;
}

export default function Transactions() {
  const { address, wallet, selectedChain } = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet || !address) {
      router.push("/login");
      return;
    }
  }, [wallet, address, router]);

  // Manual fetch function
  const fetchTransactions = async () => {
    setIsLoading(true);
    setError(null);

    // Only fetch transactions for Polygon chain
    if (selectedChain !== 'polygon') {
      console.log('Transactions only available for Polygon chain. Current chain:', selectedChain);
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    try {
      // Use correct API endpoint
      const response = await fetch(`/api/polygon/transactions?address=${address}&limit=20`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Polygon transactions response:', data);

      const { nativeTxs, tokenTxs } = data;

      // Check if API returned an error
      if (nativeTxs.status !== "1") {
        console.error('Native TX API Error:', nativeTxs.message || nativeTxs.result);
      }
      if (tokenTxs.status !== "1") {
        console.error('Token TX API Error:', tokenTxs.message || tokenTxs.result);
      }

      const nativeTransactions = nativeTxs.status === "1" && nativeTxs.result ? nativeTxs.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        timestamp: Number(tx.timeStamp),
        status: tx.isError === "1" ? 'failed' : 'success',
        tokenSymbol: 'MATIC',
      })) : [];

      const tokenTransactions = tokenTxs.status === "1" && tokenTxs.result ? tokenTxs.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatUnits(tx.value, Number(tx.tokenDecimal)),
        timestamp: Number(tx.timeStamp),
        status: tx.isError === "1" ? 'failed' : 'success',
        tokenSymbol: tx.tokenSymbol,
      })) : [];

      const allTxs = [...nativeTransactions, ...tokenTransactions].sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(allTxs);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError("거래 내역을 불러오는데 실패했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', background: 'var(--golf-gradient)', borderRadius: '18px', boxShadow: 'var(--golf-shadow)', padding: '2em 0' }}>
      <div className="card" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', position: 'relative', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1.5px solid #e6c20022', boxShadow: '0 8px 32px rgba(46, 125, 50, 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
          <FaFlagCheckered size={36} color="var(--golf-gold)" />
          <h2 style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: '2rem', margin: 0 }}>골프 스코어카드</h2>
        </div>

        {/* Manual Load Button */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={fetchTransactions}
            disabled={isLoading || selectedChain !== 'polygon'}
            className="btn glass"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: selectedChain !== 'polygon' ? 0.5 : 1
            }}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-2 border-[var(--golf-green)] border-t-transparent"></div>
                불러오는 중...
              </>
            ) : (
              <>
                <FaGolfBall size={16} />
                거래 내역 불러오기
              </>
            )}
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ color: 'var(--golf-green)', fontWeight: 600, marginBottom: 12 }}>최근 거래</h3>
          {error ? (
            <div style={{ color: 'var(--golf-gold)', fontWeight: 600 }}>{error}</div>
          ) : selectedChain === 'tron' ? (
            <div style={{ color: 'var(--golf-gold)', fontWeight: 500 }}>트론 체인의 거래 내역은 아직 지원되지 않습니다.</div>
          ) : transactions.length === 0 ? (
            <div style={{ color: 'var(--golf-gold)', fontWeight: 500 }}>
              위의 "거래 내역 불러오기" 버튼을 클릭하여 거래 내역을 확인하세요
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {transactions.map((tx) => (
                <li key={tx.hash} style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--golf-dark)', borderRadius: 14, marginBottom: 10, padding: '1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600, boxShadow: '0 2px 8px #e6c20011' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tx.tokenSymbol === 'MATIC' ? <FaGolfBall size={20} color="var(--golf-gold)" /> : <FaFlagCheckered size={20} color="var(--golf-green)" />} {tx.tokenSymbol}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 15 }}>{Number(tx.value).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, borderRadius: 8, padding: '0.2em 0.8em', background: tx.status === 'success' ? 'rgba(46,125,50,0.12)' : 'rgba(255,0,0,0.08)', color: tx.status === 'success' ? 'var(--golf-green)' : 'red', border: tx.status === 'success' ? '1px solid #2e7d3222' : '1px solid #ff000022' }}>{tx.status === 'success' ? '성공' : '실패'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
} 