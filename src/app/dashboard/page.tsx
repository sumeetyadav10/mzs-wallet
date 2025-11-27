'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/store/WalletContext';
import { useRouter, usePathname } from 'next/navigation';
import { ethers } from 'ethers';
import Navigation from '@/components/Navigation';
import { QRCodeSVG } from 'qrcode.react';
import QRCodeWithLogo from '@/components/QRCodeWithLogo';
import { motion, AnimatePresence } from 'framer-motion';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebase';
import BottomNav from '@/components/BottomNav';
import { FaGolfBall, FaFlagCheckered, FaExchangeAlt, FaSpinner } from 'react-icons/fa';
import PortfolioValue from '@/components/PortfolioValue';
import ChainSelector from '@/components/ChainSelector';
import { sendTronTransaction, isValidTronAddress, formatTrxAmount, getTronExplorerUrl, TRON_TOKENS } from '@/utils/tronUtils';
import OTPVerification from '@/components/OTPVerification';
import { API_CONFIG } from '@/lib/api-config';
import { FrontendSecurity } from '@/lib/security/frontend-security';
import { useWeb3Auth } from '@/lib/web3auth/Web3AuthProvider';
import { useCaptcha } from '@/components/security/CaptchaProvider';
import { useSecureWithdrawal } from '@/hooks/useSecureWithdrawal';
import { AddressValidator, AddressValidationResult } from '@/lib/address-validator';
import NetworkStatus from '@/components/NetworkStatus';

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
  const { wallet, address, balance, isLoading, error, createWallet, importWallet, setBalance, setWallet, setAddress, setError, selectedChain, setSelectedChain, tronWallet, tronBalance, getBalance } = useWallet();
  const { getUserInfo, isConnected, getIdToken, isLoading: web3authLoading } = useWeb3Auth();
  const { executeRecaptcha } = useCaptcha();
  
  // Enhanced secure withdrawal hook from landing page
  const {
    loading: secureWithdrawalLoading,
    error: secureWithdrawalError,
    otpData,
    showOTPModal: secureOTPModal,
    pendingWithdrawal,
    initiateWithdrawal,
    handleOTPSubmit: secureOTPSubmit,
    cancelOTP,
    setError: setSecureWithdrawalError
  } = useSecureWithdrawal();
  const [privateKey, setPrivateKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [maticBalance, setMaticBalance] = useState<string | null>(null);
  const [mzsBalance, setMzsBalance] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [tronTokens, setTronTokens] = useState<TokenBalance[]>([]);
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
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [pendingTransactionData, setPendingTransactionData] = useState<{
    recipientAddress: string;
    amount: string;
    token: TokenBalance;
  } | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);

  // Address validation function
  const validateRecipientAddress = async (address: string) => {
    if (!address) {
      setAddressValidation(null);
      return;
    }

    try {
      const validation = await AddressValidator.validateAddress(
        address, 
        selectedChain as 'polygon' | 'ethereum' | 'solana' | 'tron'
      );
      setAddressValidation(validation);
    } catch (error) {
      console.error('Address validation error:', error);
      setAddressValidation({
        isValid: false,
        addressType: 'unknown',
        warning: 'Unable to validate address format'
      });
    }
  };

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
        setError('지갑 불러오기 실패.');
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
        if (selectedChain === 'polygon') {
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
        } else if (selectedChain === 'tron' && tronBalance) {
          // Update token balances for Tron
          const allTronTokens: TokenBalance[] = [
            {
              symbol: 'TRX',
              balance: tronBalance.trxBalance.toString(),
              address: 'native',
              icon: '/tron-logo.svg'
            },
            ...tronBalance.tokens.map(token => ({
              symbol: token.symbol,
              balance: token.balance.toString(),
              address: token.address,
              icon: token.logo || '/tron-logo.svg'
            }))
          ];
          setTronTokens(allTronTokens);
          setLoading(false);
        }
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
      const interval = setInterval(fetchTokenBalances, 120000); // Reduced frequency: every 2 minutes

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
  }, [wallet, address, balance, selectedChain, tronBalance]);

  useEffect(() => {
    // Check Polygon network connection
    const checkPolygonNetwork = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
        const network = await provider.getNetwork();
        if (network.chainId !== BigInt(137)) {
          setNetworkWarning('Polygon 메인넷에 연결되지 않았습니다. RPC URL을 확인해주세요.');
        } else {
          setNetworkWarning(null);
        }
      } catch (error) {
        setNetworkWarning('Polygon 네트워크에 연결할 수 없습니다. RPC URL을 확인해주세요.');
      }
    };
    checkPolygonNetwork();
  }, []);

  // 🔐 AUTO-RESTORE SESSION FROM WEB3AUTH (from landing page)
  useEffect(() => {
    const restoreWeb3AuthSession = async () => {
      console.log('🔄 Checking for Web3Auth session restoration...', {
        web3authLoading,
        isConnected,
        hasWallet: !!wallet,
        hasAddress: !!address
      });
      
      // Don't check during initial Web3Auth loading
      if (web3authLoading) {
        console.log('⏳ Web3Auth still loading, skipping session check');
        return;
      }
      
      console.log('✅ Web3Auth finished loading, proceeding with session check');
      
      // Skip if wallet already loaded
      if (wallet && address) {
        console.log('✅ Wallet already loaded, skipping session restoration');
        return;
      }
      
      try {
        // Check if user is already connected via Web3Auth
        console.log('🔍 Checking Web3Auth connection status:', isConnected);
        if (isConnected) {
          console.log('🔍 Found Web3Auth session, attempting to restore...');
          
          try {
            // Get user info and ID token from Web3Auth session
            const userInfo = await getUserInfo();
            const idToken = await getIdToken();
            
            if (userInfo?.email && idToken) {
              console.log('✅ Web3Auth session valid, creating OAuth session...');
              
              // Generate device fingerprint
              const deviceFingerprint = `${navigator.userAgent}_${screen.width}x${screen.height}_${new Date().getTimezoneOffset()}`.substring(0, 100);
              
              // Convert Web3Auth session to OAuth session
              const oauthResponse = await fetch('/api/auth2025/auth/oauth', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-device-fingerprint': deviceFingerprint
                },
                body: JSON.stringify({
                  email: userInfo.email,
                  userInfo: userInfo,
                  idToken: idToken,
                  deviceFingerprint
                })
              });
              
              if (oauthResponse.ok) {
                const authData = await oauthResponse.json();
                
                // Store authentication tokens
                sessionStorage.setItem('accessToken', authData.accessToken);
                sessionStorage.setItem('refreshToken', authData.refreshToken || authData.accessToken);
                sessionStorage.setItem('userEmail', userInfo.email);
                sessionStorage.setItem('authMethod', 'web3auth');
                localStorage.setItem('secure_session_token', authData.sessionToken);
                
                console.log('✅ Session restored, fetching wallet...');
                
                // Fetch wallet with auth token
                const walletResponse = await fetch('/api/user-wallet2025', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authData.accessToken}`
                  },
                  body: JSON.stringify({
                    email: userInfo.email,
                    action: 'get'
                  })
                });
                
                if (walletResponse.ok) {
                  const walletData = await walletResponse.json();
                  if (walletData.privateKey) {
                    // Store wallet data
                    sessionStorage.setItem('walletPrivateKey', walletData.privateKey);
                    
                    // Create wallet instance
                    const restoredWallet = new ethers.Wallet(walletData.privateKey);
                    setWallet(restoredWallet);
                    setAddress(restoredWallet.address);
                    
                    console.log('✅ Wallet restored from Web3Auth session');
                  }
                }
              } else {
                console.log('❌ OAuth conversion failed:', oauthResponse.status);
              }
            }
          } catch (sessionError) {
            console.log('❌ Session restoration failed:', sessionError);
          }
        } else {
          console.log('❌ Web3Auth not connected - user needs to login');
          
          // Check if there are any cached tokens that we can use
          const cachedToken = sessionStorage.getItem('accessToken');
          const cachedMethod = sessionStorage.getItem('authMethod');
          console.log('🔍 Cached auth data:', {
            hasCachedToken: !!cachedToken,
            cachedMethod,
            tokenLength: cachedToken?.length
          });
        }
      } catch (error) {
        console.log('⚠️ Session restore check failed:', error);
      }
    };

    restoreWeb3AuthSession();
  }, [web3authLoading, isConnected, wallet, address]);

  const handleSend = async (e: React.FormEvent) => {
    console.log('🚀🚀🚀 HANDLE SEND FUNCTION CALLED 🚀🚀🚀');
    e.preventDefault();
    console.log('🚀 Form submission prevented');
    
    // Debug logging to identify the issue
    console.log('🚀 Send button clicked - Debug info:', {
      wallet: !!wallet,
      address: !!address,
      selectedToken: !!selectedToken,
      recipientAddress: !!recipientAddress,
      amount: amount,
      addressValidation: addressValidation
    });
    
    if (!wallet || !address || !selectedToken) {
      console.log('❌ Missing required data:', { wallet: !!wallet, address: !!address, selectedToken: !!selectedToken });
      return;
    }
    
    setSendError(null);
    setSecureWithdrawalError(null);
    
    // Enhanced address validation
    if (!recipientAddress) {
      console.log('❌ No recipient address');
      setSendError('받는 사람 주소를 입력해주세요');
      return;
    }
    
    // Enhanced amount validation
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      console.log('❌ Invalid amount:', amount);
      setSendError('유효한 금액을 입력해주세요');
      return;
    }
    
    // Address validation with warnings
    if (addressValidation && !addressValidation.isValid) {
      console.log('❌ Address validation failed:', addressValidation);
      setSendError(addressValidation.warning || '유효하지 않은 주소입니다');
      return;
    }
    
    console.log('✅ All validations passed, proceeding with transaction...');
    
    // Show warnings for risky addresses
    if (addressValidation && (addressValidation.addressType === 'token' || addressValidation.addressType === 'contract')) {
      // Still allow but warn the user
      const confirmed = window.confirm(
        `⚠️ 경고: ${addressValidation.warning}\n\n${addressValidation.suggestion}\n\n정말로 계속하시겠습니까?`
      );
      if (!confirmed) {
        return;
      }
    }

    // Execute CAPTCHA for withdrawal verification
    try {
      console.log('🔐 Executing reCAPTCHA...');
      const captchaToken = await executeRecaptcha('withdrawal');
      console.log('🔐 reCAPTCHA result:', !!captchaToken);
      if (!captchaToken) {
        console.log('❌ reCAPTCHA failed - no token');
        setSendError('CAPTCHA 인증에 실패했습니다. 다시 시도해주세요.');
        return;
      }
    } catch (error) {
      console.log('❌ reCAPTCHA error:', error);
      setSendError('CAPTCHA 인증에 실패했습니다. 다시 시도해주세요.');
      return;
    }

    // Get user email for OTP
    console.log('📧 Getting user email for OTP...');
    try {
      console.log('📧 Calling getUserInfo()...');
      const userInfo = await getUserInfo();
      console.log('📧 getUserInfo result:', userInfo);
      setUserEmail(userInfo?.email || wallet.address);
      console.log('📧 User email set to:', userInfo?.email || wallet.address);
    } catch (error) {
      console.error('❌ getUserInfo failed:', error);
      console.warn('Could not get user email, using wallet address');
      setUserEmail(wallet.address);
    }
    
    // Use secure withdrawal flow
    console.log('🚀 Starting secure withdrawal flow...');
    try {
      const privateKeyString = wallet.privateKey || sessionStorage.getItem('walletPrivateKey') || '';
      console.log('🔑 Private key available:', !!privateKeyString);
      
      console.log('🚀 Calling initiateWithdrawal with:', {
        amount: Number(amount),
        currency: selectedToken.symbol,
        toAddress: recipientAddress,
        blockchain: selectedChain,
        hasPrivateKey: !!privateKeyString
      });
      
      await initiateWithdrawal({
        amount: Number(amount),
        currency: selectedToken.symbol,
        toAddress: recipientAddress,
        blockchain: selectedChain as 'solana' | 'tron' | 'polygon',
        encryptedPrivateKey: privateKeyString
      });
      
      console.log('✅ initiateWithdrawal completed successfully');
      
      // Check if OTP generation failed
      if (secureWithdrawalError && !secureOTPModal) {
        setSendError(secureWithdrawalError);
        return;
      }
      
    } catch (error) {
      console.error('Secure withdrawal initiation failed:', error);
      const errorMessage = error instanceof Error ? error.message : '보안 인출 시작에 실패했습니다';
      
      // Handle specific authentication errors
      if (errorMessage.includes('Session expired') || errorMessage.includes('no valid token') || errorMessage.includes('Authentication session expired')) {
        setSendError('🔐 로그인 세션이 만료되었습니다. 페이지를 새로고침(F5)하여 다시 로그인해주세요.');
        
        // Show immediate prompt for refresh
        setTimeout(() => {
          if (confirm('로그인 세션이 만료되었습니다.\n\n페이지를 새로고침하여 다시 로그인하시겠습니까?')) {
            window.location.reload();
          }
        }, 1000);
      } else {
        setSendError(errorMessage);
      }
    }
  };

  // Enhanced secure OTP success handler
  const handleSecureOTPSuccess = async (otpCode: string) => {
    try {
      const result = await secureOTPSubmit(otpCode);
      
      if (result?.success) {
        // Show success message
        setSuccessDetails({
          hash: result.signature || result.txHash || '',
          amount: amount,
          token: selectedToken?.symbol || '',
          recipient: recipientAddress
        });
        setShowSuccessMessage(true);
        
        // Clear form
        setRecipientAddress('');
        setAmount('');
        setShowSendModal(false);
        setSendError(null);
        
        // Refresh balances
        setTimeout(() => {
          getBalance();
          setShowSuccessMessage(false);
          setSuccessDetails(null);
        }, 5000);
        
        console.log('[Dashboard] Secure withdrawal completed successfully:', result.signature || result.txHash);
      }
      
      return result;
    } catch (error) {
      console.error('[Dashboard] Secure OTP submission failed:', error);
      throw error; // Let the OTP component handle the error display
    }
  };
  
  const handleOTPSuccess = async () => {
    if (!pendingTransactionData || !wallet || !address) return;
    
    const { recipientAddress: recipient, amount: amt, token } = pendingTransactionData;
    
    setOtpVerified(true);
    setShowOTPModal(false);
    setTransactionStatus('pending');
    setSendError(null);
    setShowLoadingModal(true);
    
    try {
      console.log("[DEBUG] Starting transfer process:", {
        from: address,
        to: recipient,
        amount: amt,
        token: token.symbol
      });
      
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
      console.log("[DEBUG] RPC URL:", process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
      const signer = wallet.connect(provider);
      console.log("[DEBUG] Connected signer:", signer.address);
      
      console.log("[DEBUG] Recipient address validated");
      console.log("[DEBUG] Amount validated:", amt);
      
      // Get gas price
      const feeData = await provider.getFeeData();
      console.log("[DEBUG] Gas price:", feeData.gasPrice?.toString());
      
      if (!feeData.gasPrice) {
        throw new Error('가스 가격 불러오기 실패');
      }
      
      // Guard: token is not null
      if (!token) return;
      
      let txHash = '';
      let tx;
      
      if (selectedChain === 'tron') {
        // Handle Tron transaction
        const result = await sendTronTransaction(
          wallet.privateKey,
          recipient,
          Number(amt),
          token.symbol
        );
        txHash = result.txid;
        
        // Update the success details for Tron
        setSuccessDetails({
          hash: txHash,
          amount: amt,
          token: token.symbol,
          recipient: recipient
        });
        setTransactionStatus('success');
        setShowSuccessMessage(true);
        setShowLoadingModal(false);
        
        // Close modal and refresh balances
        setShowSendModal(false);
        setAmount('');
        setRecipientAddress('');
        setPendingTransactionData(null);
        setOtpVerified(false);
        setTimeout(() => {
          getBalance();
        }, 3000);
        return;
      } else if (token.symbol === 'MATIC') {
        console.log("[DEBUG] Processing MATIC transfer");
        // Check if user has enough balance including gas
        const balance = await provider.getBalance(address);
        console.log("[DEBUG] Current balance:", ethers.formatEther(balance));
        
        const requiredAmount = ethers.parseEther(amt.toString());
        const gasLimit = 21000; // Standard gas limit for MATIC transfer
        const gasCost = feeData.gasPrice * BigInt(gasLimit);
        console.log("[DEBUG] Required amount + gas:", ethers.formatEther(requiredAmount + gasCost));
        
        if (balance < requiredAmount + gasCost) {
          throw new Error('잔액 또는 가스가 부족합니다');
        }
        
        tx = await signer.sendTransaction({
          to: recipient,
          value: requiredAmount,
          gasPrice: feeData.gasPrice,
          gasLimit: gasLimit
        });
        txHash = tx.hash;
        console.log("[DEBUG] MATIC transaction sent:", tx.hash);
      } else {
        console.log("[DEBUG] Processing token transfer for:", token.symbol);
        // Guard: do not try to send as contract if address is 'MATIC'
        if (token.address === 'MATIC') {
          throw new Error('MATIC 전송은 컨트랙트가 아닌 네이티브 토큰으로 수행되어야 합니다.');
        }
        
        // Use correct ABI for MZS vs other tokens
        const abiToUse = token.symbol === 'MZS' ? MZS_ABI : ERC20_ABI;
        console.log("[DEBUG] Using ABI for token:", token.symbol);
        
        const tokenContract = new ethers.Contract(token.address, abiToUse, signer);
        console.log("[DEBUG] Token contract instance created");
        
        const decimals = await tokenContract.decimals();
        console.log("[DEBUG] Token decimals:", decimals);
        
        const parsedAmount = ethers.parseUnits(amt.toString(), decimals);
        console.log("[DEBUG] Parsed amount:", parsedAmount.toString());
        
        const balance = await tokenContract.balanceOf(address);
        console.log("[DEBUG] Token balance:", balance.toString());
        
        if (balance < parsedAmount) {
          throw new Error('토큰 잔액이 부족합니다');
        }
        
        if (typeof tokenContract.transfer !== 'function') {
          console.error("[DEBUG] Contract functions:", Object.keys(tokenContract));
          throw new Error('컨트랙트에서 transfer 기능을 사용할 수 없습니다');
        }
        
        tx = await tokenContract.transfer(recipient, parsedAmount, {
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
          amount: amt,
          token: token.symbol,
          recipient: recipient
        });
        setTransactionStatus('idle');
        return;
      }
      setShowLoadingModal(false);
      if (!receipt || receipt.status === 0) {
        throw new Error('거래 실패');
      }
      setTransactionStatus('success');
      setSuccessDetails({
        hash: txHash,
        amount: amt,
        token: token.symbol,
        recipient: recipient
      });
      setShowSuccessMessage(true);
      setRecipientAddress('');
      setAmount('');
      setPendingTransactionData(null);
      setOtpVerified(false);
      setShowSendModal(false);
      setTimeout(() => {
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
      setPendingTransactionData(null);
      setOtpVerified(false);
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
            <h2 className="text-3xl font-bold text-[var(--golf-green)]">MZS 월렛</h2>
          </div>
          <div className="flex justify-center mb-4">
            <ChainSelector selectedChain={selectedChain} onChainChange={setSelectedChain} />
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
              ) : selectedChain === 'polygon' && mzsBalance ? (
                <PortfolioValue mzsBalance={parseFloat(mzsBalance)} compact={true} />
              ) : selectedChain === 'tron' && tronBalance ? (
                <span className="text-4xl font-bold text-[var(--golf-green)]">
                  {formatTrxAmount(tronBalance.trxBalance)}
                </span>
              ) : (
                <span className="text-4xl font-bold text-[var(--golf-green)]">
                  {selectedChain === 'polygon' ? `${Number(balance).toLocaleString(undefined, { maximumFractionDigits: 4 })} MATIC` : '0 TRX'}
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
              <h3 className="text-lg font-bold text-[var(--golf-green)] mb-2 text-left">
                {selectedChain === 'polygon' ? 'Polygon' : 'Tron'} 토큰
              </h3>
              {(selectedChain === 'polygon' ? tokenBalances : tronTokens).length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {(selectedChain === 'polygon' ? tokenBalances : tronTokens).map((token, idx) => (
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
                      const currentTokens = selectedChain === 'polygon' ? tokenBalances : tronTokens;
                      const token = currentTokens.find(t => t.symbol === e.target.value);
                      setSelectedToken(token || null);
                    }}
                    required
                  >
                    <option value="" disabled>토큰을 선택하세요</option>
                    {(selectedChain === 'polygon' ? tokenBalances : tronTokens).map(token => (
                      <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => {
                      setRecipientAddress(e.target.value);
                      validateRecipientAddress(e.target.value);
                    }}
                    placeholder="받는 사람 주소"
                    className={`w-full glass ${
                      addressValidation
                        ? addressValidation.isValid
                          ? addressValidation.addressType === 'wallet'
                            ? 'border-green-500'
                            : 'border-yellow-500'
                          : 'border-red-500'
                        : ''
                    }`}
                    required
                  />
                  {addressValidation && (
                    <div className={`mt-2 text-sm ${
                      addressValidation.isValid
                        ? addressValidation.addressType === 'wallet'
                          ? 'text-green-600'
                          : 'text-yellow-600'
                        : 'text-red-600'
                    }`}>
                      {addressValidation.addressType === 'wallet' && '✅ 유효한 지갑 주소입니다'}
                      {addressValidation.addressType === 'contract' && `⚠️ ${addressValidation.warning}`}
                      {addressValidation.addressType === 'token' && `⚠️ ${addressValidation.warning}`}
                      {addressValidation.addressType === 'system' && `⚠️ ${addressValidation.warning}`}
                      {!addressValidation.isValid && `❌ ${addressValidation.warning}`}
                      {addressValidation.suggestion && (
                        <div className="mt-1 text-xs opacity-80">{addressValidation.suggestion}</div>
                      )}
                    </div>
                  )}
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
                    onClick={(e) => {
                      console.log('🔘 Send button clicked directly');
                      console.log('🔘 Button disabled:', transactionStatus === 'pending');
                      console.log('🔘 Transaction status:', transactionStatus);
                      console.log('🔘 Form data check:', {
                        recipientAddress: !!recipientAddress,
                        amount: !!amount,
                        selectedToken: !!selectedToken
                      });
                    }}
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
                <QRCodeWithLogo 
                  value={address || ''} 
                  size={160}
                  logoSrc="/mzs-logo.png"
                  logoSize={32}
                />
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
              <div className="text-lg font-bold text-[var(--golf-green)] mb-2">거래 진행 중</div>
              <div className="text-sm text-center text-[var(--golf-dark)]">거래가 블록체인에서 확인되고 있습니다. 최대 3분 소요될 수 있습니다.</div>
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
                <h3 className="font-bold text-lg">거래 대기 중</h3>
              </div>
              <div className="text-sm space-y-1">
                <p>금액: {pendingDetails.amount} {pendingDetails.token}</p>
                <p>받는 사람: {pendingDetails.recipient.slice(0, 6)}...{pendingDetails.recipient.slice(-4)}</p>
                <p className="text-xs opacity-80">
                  트랜잭션 해시: {pendingDetails.hash.slice(0, 10)}...{pendingDetails.hash.slice(-8)}
                </p>
              </div>
              <a
                href={selectedChain === 'polygon' ? `https://polygonscan.com/tx/${pendingDetails.hash}` : getTronExplorerUrl(pendingDetails.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline mt-2 inline-block"
              >
                Polygonscan에서 보기
              </a>
              <div className="text-xs mt-2">확인이 예상보다 오래 걸리고 있습니다. Polygonscan에서 상태를 확인할 수 있습니다.</div>
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
                <h3 className="font-bold text-lg">거래 성공!</h3>
              </div>
              <div className="text-sm space-y-1">
                <p>금액: {successDetails.amount} {successDetails.token}</p>
                <p>받는 사람: {successDetails.recipient.slice(0, 6)}...{successDetails.recipient.slice(-4)}</p>
                <p className="text-xs opacity-80">
                  트랜잭션 해시: {successDetails.hash.slice(0, 10)}...{successDetails.hash.slice(-8)}
                </p>
              </div>
              <a
                href={selectedChain === 'polygon' ? `https://polygonscan.com/tx/${successDetails.hash}` : getTronExplorerUrl(successDetails.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--golf-gold)] text-sm hover:underline mt-2 inline-block"
              >
                Polygonscan에서 보기
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Secure OTP Verification Modal */}
      {secureOTPModal && pendingWithdrawal && (
        <OTPVerification
          isOpen={secureOTPModal}
          onClose={cancelOTP}
          onVerify={handleSecureOTPSuccess}
          email={userEmail || wallet?.address || ''}
          amount={pendingWithdrawal.amount.toString()}
          currency={pendingWithdrawal.currency}
          toAddress={pendingWithdrawal.toAddress}
          blockchain={pendingWithdrawal.blockchain}
          loading={secureWithdrawalLoading}
          error={secureWithdrawalError}
          otpId={otpData?.otpId}
          expiresAt={otpData?.expiresAt}
        />
      )}
      
      {/* Legacy OTP Modal (fallback) */}
      {showOTPModal && pendingTransactionData && !secureOTPModal && (
        <OTPVerification
          isOpen={showOTPModal}
          onClose={() => {
            setShowOTPModal(false);
            setPendingTransactionData(null);
            setOtpVerified(false);
          }}
          onVerify={async (otpCode: string) => {
            // Handle OTP verification and then proceed with transaction
            await handleOTPSuccess();
            return true;
          }}
          email={userEmail || wallet?.address || ''}
          amount={pendingTransactionData.amount}
          currency={pendingTransactionData.token.symbol}
          toAddress={`${pendingTransactionData.recipientAddress.slice(0, 6)}...${pendingTransactionData.recipientAddress.slice(-4)}`}
          blockchain={selectedChain}
        />
      )}

      {mzsBalance && (
        <div className="mb-8">
          <PortfolioValue mzsBalance={parseFloat(mzsBalance)} />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      </div>

      {/* Network Status Component */}
      <div className="mt-8 flex justify-center">
        <NetworkStatus chain={selectedChain} />
      </div>
    </div>
  );
} 