'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useWallet } from '@/store/WalletContext';
import { ethers } from 'ethers';
import Navigation from '@/components/Navigation';
import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import { FaGolfBall, FaFlagCheckered, FaPlusCircle } from 'react-icons/fa';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  icon?: string;
}

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

export default function Tokens() {
  const router = useRouter();
  const pathname = usePathname();
  const { wallet, address } = useWallet();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTokenAddress, setNewTokenAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    console.log('[Tokens] Checking auth state:', { wallet, address });
    if (!wallet || !address) {
      router.push('/');
    }
  }, [wallet, address, router]);

  useEffect(() => {
    const fetchTokens = async () => {
      if (!wallet || !address) return;
      try {
        // 1. Try to fetch from Firestore
        const userDoc = await getDoc(doc(db, 'user_tokens', String(address)));
        let customTokens: string[] = [];
        if (userDoc.exists() && userDoc.data().customTokens) {
          customTokens = userDoc.data().customTokens;
          // Sync to localStorage
          localStorage.setItem(`customTokens_${address}`, JSON.stringify(customTokens));
        } else {
          // Fallback to localStorage if Firestore empty
          const savedTokens = localStorage.getItem(`customTokens_${address}`);
          customTokens = savedTokens ? JSON.parse(savedTokens) : [];
        }
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
        const tokenPromises: Promise<Token | null>[] = [];
        const batchSize = 5;
        for (let i = 0; i < customTokens.length; i += batchSize) {
          const batch = customTokens.slice(i, i + batchSize);
          tokenPromises.push(...batch.map(async (tokenAddress: string) => {
            try {
              const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
              let symbol, name, decimals;
              try {
                symbol = await contract.symbol();
                name = await contract.name();
                decimals = await contract.decimals();
              } catch (metaErr) {
                return null;
              }
              let balance = '0';
              try {
                const bal = await contract.balanceOf(address);
                balance = ethers.formatUnits(bal, decimals);
              } catch {
                balance = '0';
              }
              return { address: tokenAddress, symbol, name, decimals, balance };
            } catch {
              return null;
            }
          }));
          if (i + batchSize < customTokens.length) {
            await new Promise(res => setTimeout(res, 1000));
          }
        }
        const tokenResults = await Promise.all(tokenPromises);
        setTokens(tokenResults.filter((token): token is Token => token !== null));
      } catch (error) {
        setError('토큰 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTokens();
  }, [wallet, address]);

  const handleAddToken = async () => {
    setError(null);
    setIsAdding(true);
    if (!ethers.isAddress(newTokenAddress)) {
      setError('Invalid token address');
      setIsAdding(false);
      return;
    }
    if (!address) {
      setError('No wallet address');
      setIsAdding(false);
      return;
    }

    // Special case for known tokens
    const knownTokens: { [key: string]: { symbol: string; name: string; decimals: number } } = {
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': { // USDT on Polygon
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6
      }
    };

    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
      const contract = new ethers.Contract(newTokenAddress, ERC20_ABI, provider);
      let decimals, symbol, name;

      // Check if it's a known token
      if (knownTokens[newTokenAddress.toLowerCase()]) {
        const knownToken = knownTokens[newTokenAddress.toLowerCase()];
        decimals = knownToken.decimals;
        symbol = knownToken.symbol;
        name = knownToken.name;
      } else {
        // Try backend Polygonscan proxy first for unknown tokens
        let polygonscanFailed = false;
        try {
          const res = await fetch('/api/tokeninfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractAddress: newTokenAddress })
          });
          const data = await res.json();
          if (res.ok && data.token) {
            const tokenInfo = data.token;
            decimals = Number(tokenInfo.decimals);
            symbol = tokenInfo.symbol;
            name = tokenInfo.tokenName;
          } else {
            polygonscanFailed = true;
          }
        } catch (scanErr) {
          polygonscanFailed = true;
        }
        // Always try contract calls if backend Polygonscan fails
        if (polygonscanFailed) {
          try {
            const [decimalsBigInt, symbolStr, nameStr] = await Promise.all([
              contract.decimals(),
              contract.symbol(),
              contract.name()
            ]);
            decimals = Number(decimalsBigInt);
            symbol = symbolStr;
            name = nameStr;
          } catch (contractErr) {
            setError('이 컨트랙트는 표준 ERC20 메서드를 구현하지 않습니다. 주소를 확인해 주세요.');
            setIsAdding(false);
            return;
          }
        }
      }

      // Validate the data
      if (!symbol || !name || typeof decimals !== 'number' || isNaN(decimals)) {
        setError('토큰 정보가 불완전합니다. 주소를 다시 확인해 주세요.');
        setIsAdding(false);
        return;
      }

      // Add to saved tokens
      const savedTokens = localStorage.getItem(`customTokens_${address}`);
      const customTokens = savedTokens ? JSON.parse(savedTokens) : [];
      if (!customTokens.includes(newTokenAddress)) {
        customTokens.push(newTokenAddress);
        localStorage.setItem(`customTokens_${address}`, JSON.stringify(customTokens));
        // Firestore sync
        await setDoc(doc(db, 'user_tokens', String(address)), { customTokens }, { merge: true });
        window.dispatchEvent(new StorageEvent('storage', {
          key: `customTokens_${address}`,
          newValue: JSON.stringify(customTokens),
          storageArea: localStorage
        }));
        // Fetch the new token's balance
        let balance = '0';
        try {
          const bal = await contract.balanceOf(address);
          balance = ethers.formatUnits(bal, decimals);
        } catch {
          balance = '0';
        }
        const newToken: Token = {
          address: newTokenAddress,
          symbol,
          name,
          decimals,
          balance
        };
        setTokens(prevTokens => [...prevTokens, newToken]);
        setNewTokenAddress('');
      }
      setIsAdding(false);
    } catch (error) {
      setError('토큰 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      setIsAdding(false);
    }
  };

  const handleRemoveToken = async (tokenAddress: string) => {
    if (!address) return;
    const savedTokens = localStorage.getItem(`customTokens_${address}`);
    const customTokens = savedTokens ? JSON.parse(savedTokens) : [];
    const updatedTokens = customTokens.filter((addr: string) => addr !== tokenAddress);
    localStorage.setItem(`customTokens_${address}`, JSON.stringify(updatedTokens));
    // Firestore sync
    await setDoc(doc(db, 'user_tokens', String(address)), { customTokens: updatedTokens }, { merge: true });
    window.dispatchEvent(new StorageEvent('storage', {
      key: `customTokens_${address}`,
      newValue: JSON.stringify(updatedTokens),
      storageArea: localStorage
    }));
    setTokens(tokens.filter(token => token.address !== tokenAddress));
  };

  return (
    <div style={{ minHeight: '80vh', background: 'var(--golf-gradient)', borderRadius: '18px', boxShadow: 'var(--golf-shadow)', padding: '2em 0' }}>
      <div className="card" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', position: 'relative', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1.5px solid #e6c20022', boxShadow: '0 8px 32px rgba(46, 125, 50, 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
          <FaFlagCheckered size={36} color="var(--golf-gold)" />
          <h2 style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: '2rem', margin: 0 }}>내 골프 가방</h2>
        </div>
        <div style={{ marginBottom: 24 }}>
          <form onSubmit={e => { e.preventDefault(); handleAddToken(); }} style={{ display: 'flex', gap: 0, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <input
              type="text"
              value={newTokenAddress}
              onChange={e => setNewTokenAddress(e.target.value)}
              placeholder="토큰 주소 추가"
              style={{ flex: 1, minWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', marginBottom: 0, height: 48, fontSize: 16 }}
              disabled={isAdding}
            />
            <button type="submit" className="btn" style={{ background: 'var(--golf-gold)', color: 'var(--golf-dark)', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 48, fontSize: 16, boxShadow: 'none', marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }} disabled={isAdding}>
              <FaPlusCircle /> 추가
            </button>
          </form>
          {error && <div style={{ color: 'var(--golf-green)', marginTop: 8, fontWeight: 600 }}>{error}</div>}
        </div>
        <div style={{ marginTop: 16 }}>
          <h3 style={{ color: 'var(--golf-green)', fontWeight: 600, marginBottom: 12 }}>내 가방의 토큰</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tokens.length === 0 && <li style={{ color: 'var(--golf-gold)', fontWeight: 500 }}>아직 토큰이 없습니다. 첫 번째 클럽을 추가해보세요!</li>}
            {tokens.map((token, idx) => (
              <li key={token.address} style={{ background: 'var(--golf-accent)', color: 'var(--golf-dark)', borderRadius: 12, marginBottom: 10, padding: '1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {token.symbol === 'MATIC' ? <FaGolfBall size={20} color="var(--golf-gold)" /> : <FaFlagCheckered size={20} color="var(--golf-green)" />} {token.symbol}
                </span>
                <span>{token.balance}</span>
                <button onClick={() => handleRemoveToken(token.address)} style={{ background: 'none', border: 'none', color: 'var(--golf-gold)', fontWeight: 700, cursor: 'pointer', fontSize: 18 }} title="Remove token">×</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <BottomNav />
    </div>
  );
} 