import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getUserWallet, updateUserWallet } from '@/lib/database';
import { getTronWallet, getTronBalance, type TronWallet, type TronBalance } from '@/utils/tronUtils';
import type { Chain } from '@/components/ChainSelector';

type WalletType = ethers.Wallet | ethers.HDNodeWallet;

interface WalletContextType {
  wallet: WalletType | null;
  address: string | null;
  balance: string;
  isLoading: boolean;
  error: string | null;
  createWallet: () => Promise<void>;
  importWallet: (privateKey: string) => Promise<void>;
  getBalance: () => Promise<void>;
  setBalance: (balance: string) => void;
  resetWallet: () => void;
  setWallet: React.Dispatch<React.SetStateAction<WalletType | null>>;
  setAddress: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  // Multi-chain support
  selectedChain: Chain;
  setSelectedChain: (chain: Chain) => void;
  tronWallet: TronWallet | null;
  tronBalance: TronBalance | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<Chain>('polygon');
  const [tronWallet, setTronWallet] = useState<TronWallet | null>(null);
  const [tronBalance, setTronBalance] = useState<TronBalance | null>(null);

  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);

  const createWallet = async () => {
    try {
      setIsLoading(true);
      const newWallet = ethers.Wallet.createRandom();
      setWallet(newWallet);
      setAddress(newWallet.address);
      sessionStorage.setItem('walletPrivateKey', newWallet.privateKey);
      const userId = sessionStorage.getItem('userId');
      if (userId) {
        await updateUserWallet(userId, newWallet.privateKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const importWallet = async (privateKey: string) => {
    try {
      setIsLoading(true);
      const importedWallet = new ethers.Wallet(privateKey, provider);
      setWallet(importedWallet);
      setAddress(importedWallet.address);
      sessionStorage.setItem('walletPrivateKey', privateKey);
      const userId = sessionStorage.getItem('userId');
      if (userId) {
        await updateUserWallet(userId, privateKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const getBalance = async () => {
    if (!address) return;
    try {
      if (selectedChain === 'polygon') {
        const balance = await provider.getBalance(address);
        setBalance(ethers.formatEther(balance));
      } else if (selectedChain === 'tron' && tronWallet) {
        const tronBalanceData = await getTronBalance(tronWallet.address);
        setTronBalance(tronBalanceData);
        setBalance(tronBalanceData.trxBalance.toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get balance');
    }
  };

  // Reset wallet/account state
  const resetWallet = () => {
    setWallet(null);
    setAddress(null);
    setBalance('0');
    setError(null);
    setTronWallet(null);
    setTronBalance(null);
  };

  // Listen for sessionStorage changes (cross-tab and in-app)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'walletPrivateKey' || e.key === 'userId') {
        loadWallet();
      }
    };
    window.addEventListener('storage', handleStorage);

    // Also, monkey-patch sessionStorage.setItem to call loadWallet in the same tab
    const originalSetItem = sessionStorage.setItem;
    sessionStorage.setItem = function(key, value) {
      originalSetItem.apply(this, [key, value]);
      if (key === 'walletPrivateKey' || key === 'userId') {
        loadWallet();
      }
    };

    return () => {
      window.removeEventListener('storage', handleStorage);
      sessionStorage.setItem = originalSetItem;
    };
  }, []);

  // Expose loadWallet for storage event
  const loadWallet = async () => {
    try {
      const savedKey = sessionStorage.getItem('walletPrivateKey');
      if (savedKey) {
        const loadedWallet = new ethers.Wallet(savedKey, provider);
        setWallet(loadedWallet);
        setAddress(loadedWallet.address);
        return;
      }
      const userId = sessionStorage.getItem('userId');
      if (userId) {
        const userWallet = await getUserWallet(userId);
        if (userWallet) {
          setWallet(userWallet);
          setAddress(userWallet.address);
          if (userWallet.privateKey) {
            sessionStorage.setItem('walletPrivateKey', userWallet.privateKey);
          }
        }
      } else {
        resetWallet();
      }
    } catch (err) {
      console.error('[WalletContext] Error loading wallet:', err);
      sessionStorage.removeItem('walletPrivateKey');
      resetWallet();
      setError('지갑 정보를 불러오는 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.');
    }
  };

  useEffect(() => {
    loadWallet();
  }, []);

  // Load Tron wallet when wallet is available
  useEffect(() => {
    const loadTronWallet = async () => {
      // Get user email from localStorage (stored by Web3Auth)
      const userInfoStr = localStorage.getItem('userInfo');
      
      if (userInfoStr && wallet) {
        try {
          const userInfo = JSON.parse(userInfoStr);
          const email = userInfo.email;
          
          if (email) {
            try {
              console.log('[WalletContext] Loading Tron wallet for authenticated user');
              const tronWalletData = await getTronWallet();
              console.log('[WalletContext] Tron wallet loaded:', tronWalletData);
              setTronWallet(tronWalletData);
              if (selectedChain === 'tron') {
                setAddress(tronWalletData.address);
              }
            } catch (tronError) {
              // Don't let Tron issues break the entire wallet
              if (process.env.NODE_ENV === 'development') {
                console.warn('[WalletContext] Tron wallet failed to load:', tronError);
              }
              // Set null Tron wallet but continue with other functionality
              setTronWallet(null);
              
              // If user was on Tron chain, switch to polygon as fallback
              if (selectedChain === 'tron') {
                setSelectedChain('polygon');
                setAddress(wallet.address); // Use main wallet address
              }
            }
          } else {
            console.log('[WalletContext] No email found in userInfo');
          }
        } catch (err) {
          console.error('Failed to load wallet context:', err);
        }
      }
    };
    loadTronWallet();
  }, [wallet]);

  // Update address when chain changes
  useEffect(() => {
    if (selectedChain === 'polygon' && wallet) {
      setAddress(wallet.address);
    } else if (selectedChain === 'tron' && tronWallet) {
      setAddress(tronWallet.address);
    }
  }, [selectedChain, wallet, tronWallet]);

  useEffect(() => {
    if (address) {
      getBalance();
    }
  }, [address, selectedChain]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        address,
        balance,
        isLoading,
        error,
        createWallet,
        importWallet,
        getBalance,
        setBalance,
        resetWallet,
        setWallet,
        setAddress,
        setError,
        selectedChain,
        setSelectedChain,
        tronWallet,
        tronBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}; 