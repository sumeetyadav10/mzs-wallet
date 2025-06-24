'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/store/WalletContext';
import { useRouter, usePathname } from 'next/navigation';
import { ethers } from 'ethers';
import Navigation from '@/components/Navigation';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebase';
import BottomNav from '@/components/BottomNav';
import { FaGolfBall, FaFlagCheckered, FaExchangeAlt, FaSpinner } from 'react-icons/fa';
import PortfolioValue from '@/components/PortfolioValue';

if (!getApps().length) {
  initializeApp(firebaseConfig);
}

const MZS_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const MZS_ADDRESS = "0x1aDb749FFDA33251e1503672951b5A4234518Fa7";

interface TokenBalance {
  symbol: string;
  balance: string;
  address: string;
  icon: string;
  fiat?: string;
}

const tokenIcons: Record<string, string> = {
  MATIC: '/matic-logo.png',
  MZS: '/mzs-logo.png',
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

type ModalState = null | { type: 'send' | 'receive', token: TokenBalance | null };

export default function Dashboard() {
  const { wallet, address, balance, isLoading, error, createWallet, importWallet, setBalance, setWallet, setAddress, setError } = useWallet();
  const [privateKey, setPrivateKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [maticBalance, setMaticBalance] = useState<string | null>(null);
  const [mzsBalance, setMzsBalance] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const router = useRouter();
  const pathname = usePathname();
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successDetails, setSuccessDetails] = useState<{
    hash: string;
    amount: string;
    token: string;
    recipient: string;
  } | null>(null);
  const [showPendingMessage, setShowPendingMessage] = useState(false);
  const [pendingDetails, setPendingDetails] = useState<{
    hash: string;
    amount: string;
    token: string;
    recipient: string;
  } | null>(null);
  const [showLoadingModal, setShowLoadingModal] = useState(false);

  useEffect(() => {
    const loadWallet = async () => {
      setLoading(true);
      setError(null);
      try {
        // Only load from sessionStorage
        const privateKey = sessionStorage.getItem('walletPrivateKey');
        if (!privateKey) {
          setError('페이지를 새로고침하고 Google 계정으로 다시 로그인해 주세요.');
          setLoading(false);
          return;
        }
        const w = new ethers.Wallet(privateKey);
        setWallet(w);
        setAddress(w.address);
        setLoading(false);
      } catch (err) {
        setError('Failed to load wallet.');
        setLoading(false);
      }
    };
    loadWallet();
  }, []);

  useEffect(() => {
    setLoading(true); // Reset loading state when wallet/address/balance changes
    const fetchTokenBalances = async () => {
      if (!wallet || !address) return;
      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
        // MATIC
        setMaticBalance(balance);
        // MZS
        const mzsContract = new ethers.Contract(MZS_ADDRESS, MZS_ABI, provider);
        const [mzsRaw, decimals, symbol] = await Promise.all([
          mzsContract.balanceOf(address),
          mzsContract.decimals(),
          mzsContract.symbol()
        ]);
        setMzsBalance(ethers.formatUnits(mzsRaw, decimals));
        // Custom tokens
        const savedTokens = localStorage.getItem(`customTokens_${address}`);
        const customTokens: string[] = savedTokens ? JSON.parse(savedTokens) : [];
        const customTokenBalances: TokenBalance[] = [];
        const batchSize = 5;
        for (let i = 0; i < customTokens.length; i += batchSize) {
          const batch = customTokens.slice(i, i + batchSize);
          await Promise.all(batch.map(async (tokenAddress) => {
            try {
              const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
              const [balance, decimals, symbol] = await Promise.all([
                contract.balanceOf(address),
                contract.decimals(),
                contract.symbol()
              ]);
              customTokenBalances.push({
                symbol,
                balance: ethers.formatUnits(balance, decimals),
                address: tokenAddress,
                icon: tokenIcons[symbol] || ''
              });
            } catch (error) {
              console.error(`Error fetching balance for token ${tokenAddress}:`, error);
            }
          }));
          if (i + batchSize < customTokens.length) {
            await new Promise(res => setTimeout(res, 1000)); // Wait 1 second between batches
          }
        }

        // Combine all token balances
        const allTokens: TokenBalance[] = [
          {
            symbol: 'MATIC',
            balance: balance,
            address: 'MATIC',
            icon: tokenIcons['MATIC']
          },
          {
            symbol: 'MZS',
            balance: ethers.formatUnits(mzsRaw, decimals),
            address: MZS_ADDRESS,
            icon: tokenIcons['MZS']
          },
          ...customTokenBalances
        ];

        setTokenBalances(allTokens);
        setTokenError(null);
      } catch (error) {
        setTokenError('토큰 잔액을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        setTokenBalances([]);
        setMaticBalance(null);
        setMzsBalance(null);
        console.error('Error fetching token balances:', error);
      } finally {
        setLoading(false);
      }
    };

    if (wallet && address) {
      fetchTokenBalances();
      // Update balances every 30 seconds
      const interval = setInterval(fetchTokenBalances, 30000);

      // Listen for changes in localStorage
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === `customTokens_${address}`) {
          fetchTokenBalances();
        }
      };

      window.addEventListener('storage', handleStorageChange);

      return () => {
        clearInterval(interval);
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, [wallet, address, balance]);

  useEffect(() => {
    // Check Polygon network connection
    const checkPolygonNetwork = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
        const network = await provider.getNetwork();
        if (network.chainId !== BigInt(137)) {
          setNetworkWarning('Not connected to Polygon Mainnet. Please check your RPC URL.');
        } else {
          setNetworkWarning(null);
        }
      } catch (error) {
        setNetworkWarning('Unable to connect to Polygon network. Please check your RPC URL.');
      }
    };
    checkPolygonNetwork();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet || !address || !selectedToken) return;
    setTransactionStatus('pending');
    setSendError(null);
    setShowLoadingModal(true);
    try {
      console.log("[DEBUG] Starting transfer process:", {
        from: address,
        to: recipientAddress,
        amount,
        token: selectedToken.symbol
      });
      
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
      console.log("[DEBUG] RPC URL:", process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
      const signer = wallet.connect(provider);
      console.log("[DEBUG] Connected signer:", signer.address);
      
      // Validate address
      if (!ethers.isAddress(recipientAddress)) {
        throw new Error('잘못된 받는 사람 주소입니다');
      }
      console.log("[DEBUG] Recipient address validated");
      
      // Validate amount
      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new Error('잘못된 금액입니다');
      }
      console.log("[DEBUG] Amount validated:", amount);
      
      // Get gas price
      const feeData = await provider.getFeeData();
      console.log("[DEBUG] Gas price:", feeData.gasPrice?.toString());
      
      if (!feeData.gasPrice) {
        throw new Error('Failed to get gas price');
      }
      
      // Guard: selectedToken is not null
      if (!selectedToken) return;
      
      let txHash = '';
      let tx;
      
      if (selectedToken.symbol === 'MATIC') {
        console.log("[DEBUG] Processing MATIC transfer");
        // Check if user has enough balance including gas
        const balance = await provider.getBalance(address);
        console.log("[DEBUG] Current balance:", ethers.formatEther(balance));
        
        const requiredAmount = ethers.parseEther(amount.toString());
        const gasLimit = 21000; // Standard gas limit for MATIC transfer
        const gasCost = feeData.gasPrice * BigInt(gasLimit);
        console.log("[DEBUG] Required amount + gas:", ethers.formatEther(requiredAmount + gasCost));
        
        if (balance < requiredAmount + gasCost) {
          throw new Error('잔액 또는 가스가 부족합니다');
        }
        
        tx = await signer.sendTransaction({
          to: recipientAddress,
          value: requiredAmount,
          gasPrice: feeData.gasPrice,
          gasLimit: gasLimit
        });
        txHash = tx.hash;
        console.log("[DEBUG] MATIC transaction sent:", tx.hash);
      } else {
        console.log("[DEBUG] Processing token transfer for:", selectedToken.symbol);
        // Guard: do not try to send as contract if address is 'MATIC'
        if (selectedToken.address === 'MATIC') {
          throw new Error('MATIC transfers must be done as native token, not as a contract.');
        }
        
        // Use correct ABI for MZS vs other tokens
        const abiToUse = selectedToken.symbol === 'MZS' ? MZS_ABI : ERC20_ABI;
        console.log("[DEBUG] Using ABI for token:", selectedToken.symbol);
        
        const tokenContract = new ethers.Contract(selectedToken.address, abiToUse, signer);
        console.log("[DEBUG] Token contract instance created");
        
        const decimals = await tokenContract.decimals();
        console.log("[DEBUG] Token decimals:", decimals);
        
        const parsedAmount = ethers.parseUnits(amount.toString(), decimals);
        console.log("[DEBUG] Parsed amount:", parsedAmount.toString());
        
        const balance = await tokenContract.balanceOf(address);
        console.log("[DEBUG] Token balance:", balance.toString());
        
        if (balance < parsedAmount) {
          throw new Error('Insufficient token balance');
        }
        
        if (typeof tokenContract.transfer !== 'function') {
          console.error("[DEBUG] Contract functions:", Object.keys(tokenContract));
          throw new Error('transfer function is not available on the contract instance');
        }
        
        tx = await tokenContract.transfer(recipientAddress, parsedAmount, {
          gasPrice: feeData.gasPrice
        });
        txHash = tx.hash;
        console.log("[DEBUG] Token transaction sent:", tx.hash);
      }
      
      // Wait for confirmation with 180s timeout
      let receipt;
      try {
        receipt = await tx.wait(1, 180000); // 180s timeout
      } catch (waitError) {
        // Timeout or network error
        setShowLoadingModal(false);
        setShowPendingMessage(true);
        setPendingDetails({
          hash: txHash,
          amount: amount,
          token: selectedToken.symbol,
          recipient: recipientAddress
        });
        setTransactionStatus('idle');
        return;
      }
      setShowLoadingModal(false);
      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }
      setTransactionStatus('success');
      setSuccessDetails({
        hash: txHash,
        amount: amount,
        token: selectedToken.symbol,
        recipient: recipientAddress
      });
      setShowSuccessMessage(true);
      setRecipientAddress('');
      setAmount('');
      setTimeout(() => {
        setModal(null);
        setShowSuccessMessage(false);
        setSuccessDetails(null);
      }, 5000);
      // Refresh balances
      const newBalance = await provider.getBalance(address);
      setBalance(ethers.formatEther(newBalance));
      console.log("[DEBUG] Transfer completed successfully");
      
    } catch (error) {
      setShowLoadingModal(false);
      setTransactionStatus('error');
      setSendError(error instanceof Error ? error.message : 'Transaction failed');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const tokensLoaded = !!wallet && !!address;

  // Add a function to refresh token balances
  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(res => setTimeout(res, 300)); // Simulate loading
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181A20]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  if (error) {
  return (
      <div className="min-h-screen flex items-center justify-center bg-[#181A20] text-white">
        <div className="bg-[var(--danger)]/20 text-[var(--danger)] px-4 py-3 rounded-md max-w-md mx-auto mt-4 mb-2 text-center font-semibold border-l-4 border-[var(--danger)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="golf-pattern absolute inset-0"></div>
      <div className="relative z-10">
        <div className="card glass animate-float">
          <div className="flex items-center justify-center gap-4 mb-6">
            <img src="/MZS.png" alt="MZS Logo" style={{ width: 36, height: 36, marginRight: 8, borderRadius: '50%' }} />
            <h2 className="text-3xl font-bold text-[var(--golf-green)]">MZS 월렛</h2>
          </div>
          <div className="mb-8">
            <div className="text-center mb-2">
              <span className="text-[var(--golf-dark)] text-sm">총 보유 자산</span>
            </div>
            <div className="text-center">
              {isLoading ? (
                <div className="animate-pulse-slow">Loading...</div>
              ) : error ? (
                <div className="text-[var(--korean-red)]">{error}</div>
              ) : mzsBalance ? (
                <PortfolioValue mzsBalance={parseFloat(mzsBalance)} compact={true} />
              ) : (
                <span className="text-4xl font-bold text-[var(--golf-green)]">
                  ${Number(balance).toLocaleString(undefined, { maximumFractionDigits: 4 })} MATIC
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-center gap-4 mb-6">
            <button
              onClick={() => setShowSendModal(true)}
              className="btn glass flex items-center gap-2"
            >
              <FaExchangeAlt className="transform rotate-90" />
              Send
            </button>
            <button
              onClick={() => setShowReceiveModal(true)}
              className="btn glass flex items-center gap-2"
            >
              <FaExchangeAlt className="transform -rotate-90" />
              Receive
            </button>
          </div>
          <div className="text-center mb-4">
            <div className="inline-block p-2 rounded-lg bg-[var(--golf-accent)]/10">
              <span className="text-[var(--golf-dark)] text-sm font-mono">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '...'}
              </span>
            </div>
          </div>
          {/* Token List */}
          <div className="w-full max-w-[420px] mx-auto">
            <div className="glass p-3 rounded-2xl shadow mb-2">
              <h3 className="text-lg font-bold text-[var(--golf-green)] mb-2 text-left">내 토큰</h3>
              {tokenBalances && tokenBalances.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {tokenBalances.map((token, idx) => (
                    <li key={token.symbol + idx} className="flex items-center justify-between bg-[var(--golf-accent)]/20 rounded-xl px-3 py-2 font-semibold text-[var(--golf-dark)]">
                      <span className="flex items-center gap-2">
                        {token.icon && <img src={token.icon} alt={token.symbol} className="w-5 h-5 rounded-full" />}
                        {token.symbol}
                      </span>
                      <span className="font-mono text-[15px]">{Number(token.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[var(--golf-gold)] text-center py-2">아직 토큰이 없습니다. 첫 번째 클럽을 추가해보세요!</div>
              )}
            </div>
          </div>
        </div>

        {showSendModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="glass rounded-2xl p-8 max-w-sm w-full border border-[var(--golf-gold)] animate-glow">
              <h3 className="text-2xl font-bold text-[var(--golf-green)] mb-6">{selectedToken ? `${selectedToken.symbol} 보내기` : '토큰 보내기'}</h3>
              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-[var(--golf-green)]">토큰 선택</label>
                  <select
                    className="w-full glass mb-2"
                    value={selectedToken ? selectedToken.symbol : ''}
                    onChange={e => {
                      const token = tokenBalances.find(t => t.symbol === e.target.value);
                      setSelectedToken(token || null);
                    }}
                    required
                  >
                    <option value="" disabled>토큰을 선택하세요</option>
                    {tokenBalances.map(token => (
                      <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="받는 사람 주소"
                    className="w-full glass"
                    required
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="금액"
                    className="w-full glass"
                    required
                    step="any"
                    min="0"
                  />
                </div>
                {sendError && (
                  <div className="text-[var(--korean-red)] text-sm">{sendError}</div>
                )}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowSendModal(false)}
                    className="flex-1 btn glass"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={transactionStatus === 'pending'}
                    className="flex-1 btn glass"
                  >
                    {transactionStatus === 'pending' ? "전송 중..." : "보내기"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showReceiveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="glass rounded-2xl p-8 max-w-sm w-full border border-[var(--golf-gold)] animate-glow">
              <h3 className="text-2xl font-bold text-[var(--golf-green)] mb-6">내 월렛 주소 받기</h3>
              <div className="text-center mb-6 flex flex-col items-center gap-4">
                <QRCodeSVG value={address || ''} size={160} bgColor="#fff" fgColor="#1B5E20" />
                <div className="inline-block p-4 rounded-xl bg-white/50">
                  <span className="text-[var(--golf-dark)] font-mono">
                    {address || '...'}
                  </span>
                </div>
                <button
                  className="btn glass mt-2"
                  onClick={() => { copyToClipboard(address || ''); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
                >
                  {copied ? '복사됨!' : '주소 복사'}
                </button>
              </div>
              <button
                onClick={() => setShowReceiveModal(false)}
                className="w-full btn glass"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
      <BottomNav />

      {/* Loading Modal */}
      <AnimatePresence>
        {showLoadingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <div className="glass rounded-2xl p-8 max-w-xs w-full flex flex-col items-center border border-[var(--golf-gold)] animate-glow">
              <FaSpinner className="animate-spin text-4xl text-[var(--golf-green)] mb-4" />
              <div className="text-lg font-bold text-[var(--golf-green)] mb-2">Transaction in Progress</div>
              <div className="text-sm text-center text-[var(--golf-dark)]">Please wait while your transaction is being confirmed on the blockchain. This may take up to 3 minutes.</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Modal */}
      <AnimatePresence>
        {showPendingMessage && pendingDetails && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div className="bg-yellow-500 text-white px-6 py-4 rounded-lg shadow-lg max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-2">
                <FaFlagCheckered className="text-white" />
                <h3 className="font-bold text-lg">Transaction Pending</h3>
              </div>
              <div className="text-sm space-y-1">
                <p>Amount: {pendingDetails.amount} {pendingDetails.token}</p>
                <p>To: {pendingDetails.recipient.slice(0, 6)}...{pendingDetails.recipient.slice(-4)}</p>
                <p className="text-xs opacity-80">
                  Transaction Hash: {pendingDetails.hash.slice(0, 10)}...{pendingDetails.hash.slice(-8)}
                </p>
              </div>
              <a
                href={`https://polygonscan.com/tx/${pendingDetails.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline mt-2 inline-block"
              >
                View on Polygonscan
              </a>
              <div className="text-xs mt-2">Confirmation is taking longer than expected. You can check the status on Polygonscan.</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessMessage && successDetails && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div className="bg-[var(--golf-green)] text-white px-6 py-4 rounded-lg shadow-lg max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-2">
                <FaFlagCheckered className="text-[var(--golf-gold)]" />
                <h3 className="font-bold text-lg">Transaction Successful!</h3>
              </div>
              <div className="text-sm space-y-1">
                <p>Amount: {successDetails.amount} {successDetails.token}</p>
                <p>To: {successDetails.recipient.slice(0, 6)}...{successDetails.recipient.slice(-4)}</p>
                <p className="text-xs opacity-80">
                  Transaction Hash: {successDetails.hash.slice(0, 10)}...{successDetails.hash.slice(-8)}
                </p>
              </div>
              <a
                href={`https://polygonscan.com/tx/${successDetails.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--golf-gold)] text-sm hover:underline mt-2 inline-block"
              >
                View on Polygonscan
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {mzsBalance && (
        <div className="mb-8">
          <PortfolioValue mzsBalance={parseFloat(mzsBalance)} />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      </div>
    </div>
  );
} 