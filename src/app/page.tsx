'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createUser } from '@/lib/database';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import MigrationModal from '@/components/MigrationModal';
import { useAuth } from '@/hooks/useAuth';
import { useSecureAuth } from '@/hooks/useSecureAuth';
import { useCaptcha } from '@/components/security/CaptchaProvider';
import ReCAPTCHA from 'react-google-recaptcha';
import { SecureAPIClient, SecurityLogger, FrontendSecurity } from '@/lib/security/frontend-security';
import { FaGolfBall } from 'react-icons/fa';

export default function Home() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [legacyUserId, setLegacyUserId] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [recaptchaV2Token, setRecaptchaV2Token] = useState<string | null>(null);
  const recaptchaV2Ref = useRef<ReCAPTCHA>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [agreeNewUser, setAgreeNewUser] = useState(false);
  const [showOldUserModal, setShowOldUserModal] = useState(false);
  const [oldUserEmail, setOldUserEmail] = useState('');
  const [oldUserPassword, setOldUserPassword] = useState('');
  const [oldUserError, setOldUserError] = useState<string | null>(null);
  const [oldUserLoading, setOldUserLoading] = useState(false);
  const router = useRouter();
  const { connect, getUserInfo, getIdToken, isLoading: web3authLoading, web3auth, isConnected, isMobile, closeAuthPopup } = useAuth();
  const { authenticateSecurely } = useSecureAuth();
  const { executeRecaptcha, isLoaded: captchaLoaded } = useCaptcha();

  // 🔐 AUTO-REDIRECT IF ALREADY LOGGED IN
  useEffect(() => {
    const checkExistingSession = async () => {
      // Don't check during initial Web3Auth loading
      if (web3authLoading) return;
      
      try {
        // Check if user is already connected via Web3Auth
        if (isConnected) {
          console.log('🔍 Found Web3Auth session, but need to fetch wallet from Firestore...');
          
          try {
            // Get user info from Web3Auth session
            const userInfo = await getUserInfo();
            if (userInfo?.email) {
              console.log('📧 Getting existing wallet from Firestore for:', userInfo.email);
              
              // 🔐 SECURE: Fetch existing wallet using secure endpoint
              const accessToken = sessionStorage.getItem('accessToken');
              if (!accessToken) {
                console.log('No access token found for wallet access');
                return;
              }
              
              console.log('🔐 Accessing wallet with stored access token + device verification...');
              // Get user email from stored userInfo
              const storedUserInfo = localStorage.getItem('userInfo');
              const parsedUserInfo = storedUserInfo ? JSON.parse(storedUserInfo) : null;
              const userEmail = parsedUserInfo?.email;
              
              if (!userEmail) {
                console.log('No user email available for wallet access');
                return;
              }
              
              // Generate device fingerprint for verification
              const deviceFingerprint = FrontendSecurity.generateDeviceFingerprint();
              
              const walletRes = await fetch(`/api/${process.env.NEXT_PUBLIC_API_USER_WALLET}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${accessToken}`,
                  'X-Device-Fingerprint': deviceFingerprint,
                  'X-Timestamp': Date.now().toString()
                },
                body: JSON.stringify({
                  email: userEmail
                })
              });
              
              if (!walletRes.ok) {
                const errorText = await walletRes.text();
                console.log('Wallet access failed:', errorText);
                return;
              }
              
              const data = await walletRes.json();
              
              if (data && (data.encryptedPrivateKey || data.private_key)) {
                console.log('✅ Found existing wallet in Firestore with enhanced security');
                // Store encrypted private key securely
                const keyToStore = data.encryptedPrivateKey || data.private_key;
                sessionStorage.setItem('walletPrivateKey', keyToStore);
                sessionStorage.setItem('keyEncrypted', data.encryptedPrivateKey ? 'true' : 'false');
                if (data.user_id) {
                  sessionStorage.setItem('userId', data.user_id);
                }
                localStorage.setItem('userInfo', JSON.stringify(userInfo));
                
                console.log('🚀 Using Firestore wallet, redirecting to dashboard...');
                setRedirecting(true);
                router.push('/dashboard');
                return;
              } else {
                // If no wallet found in Firestore, show error
                console.log('❌ No existing wallet found in Firestore for session');
                setError('기존 지갑을 찾을 수 없습니다. 먼저 웹 앱에서 지갑을 생성해주세요.');
                return;
              }
            }
          } catch (error) {
            console.log('❌ Error fetching wallet from Firestore:', error);
            setError('지갑 로딩 오류가 발생했습니다. 다시 로그인해주세요.');
            return;
          }
        }
        
        // Check localStorage for saved session
        const savedUserInfo = localStorage.getItem('userInfo');
        const savedPrivateKey = sessionStorage.getItem('walletPrivateKey');
        
        if (savedUserInfo && savedPrivateKey) {
          console.log('📱 Found existing session, redirecting to dashboard...');
          setRedirecting(true);
          router.push('/dashboard');
          return;
        }
        
        console.log('📋 No existing session found, showing login page');
      } catch (error) {
        console.log('⚠️ Session check failed:', error);
      }
    };

    checkExistingSession();
  }, [web3authLoading, isConnected, router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCaptchaError(null);
    setIsLoading(true);
    
    try {
      // Check if reCAPTCHA v2 is completed
      if (!recaptchaV2Token) {
        setCaptchaError('reCAPTCHA 확인을 완료해주세요.');
        setIsLoading(false);
        return;
      }
      
      console.log('🔐 reCAPTCHA v2 verified, attempting SECURE login for user:', userId);
      
      // Log security event
      SecurityLogger.logSecurityEvent({
        type: 'AUTH_ATTEMPT',
        userId,
        success: false, // Will update on success
        details: { method: 'secure_auth', userAgent: navigator.userAgent }
      });
      
      // Use secure authentication method (maintains security while using direct API)
      const data = await SecureAPIClient.authenticateSecure(userId, password, recaptchaV2Token);
      
      // Log successful authentication
      SecurityLogger.logSecurityEvent({
        type: 'AUTH_ATTEMPT',
        userId,
        success: true,
        details: { 
          method: 'secure_legacy_auth', 
          hasEncryptedKey: !!data.encryptedPrivateKey,
          isAdmin: data.isAdmin || false,
          securityVersion: data.securityInfo?.version || '2.0'
        }
      });
      
      if (data.accessToken && data.encryptedPrivateKey) {
        // Store access token for authenticated API calls
        sessionStorage.setItem('accessToken', data.accessToken);
        sessionStorage.setItem('refreshToken', data.refreshToken);
        // --- Block legacy login for migrated users ---
        if (data.auth_email) {
          setShowMigration(false);
          setLegacyUserId(null);
          setError('이미 지갑이 마이그레이션되었습니다. 구글로 로그인해주세요.');
          setIsLoading(false);
          return;
        }
        // Only show migration modal for legacy users
        setLegacyUserId(userId);
        setShowMigration(true);
        setIsLoading(false);
        return;
      } else {
        // Handle CAPTCHA-specific errors
        if (data.code === 'CAPTCHA_REQUIRED' || data.code === 'CAPTCHA_INVALID') {
          setCaptchaError(data.error || 'CAPTCHA 인증에 실패했습니다');
        } else {
          setError(data.error || '잘못된 사용자 ID 또는 비밀번호입니다');
        }
        // Reset reCAPTCHA on error
        setRecaptchaV2Token(null);
        recaptchaV2Ref.current?.reset();
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err instanceof Error && err.message.includes('CAPTCHA')) {
        setCaptchaError(err.message);
      } else {
        setError(err instanceof Error ? err.message : '인증에 실패했습니다');
      }
      // Reset reCAPTCHA on error
      setRecaptchaV2Token(null);
      recaptchaV2Ref.current?.reset();
    } finally {
      setIsLoading(false);
    }
  };

  // Defensive: Hide migration modal if error is set
  useEffect(() => {
    if (error || captchaError) {
      setShowMigration(false);
      setLegacyUserId(null);
      // Reset reCAPTCHA on any error
      setRecaptchaV2Token(null);
      recaptchaV2Ref.current?.reset();
    }
  }, [error, captchaError]);

  // Google OAuth handler with complete landing page security implementation
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    setShowGoogleModal(false);  // Close modal when starting sign-in
    
    console.log('🚀 Google login clicked - MZS Wallet enhanced auth');

    try {
      console.log('🔄 Calling connect()...');
      
      await connect();
      console.log('✅ Connect completed');
      
      // Get user info - same for both mobile and web
      console.log('🔄 Getting user info...');
      const userInfo = await getUserInfo();
      
      console.log('🔍 CRITICAL DEBUG - User info received:', {
        hasUserInfo: !!userInfo,
        userInfoKeys: userInfo ? Object.keys(userInfo) : [],
        email: userInfo?.email,
        name: userInfo?.name,
        hasEmail: !!(userInfo?.email)
      });
      
      // Check if userInfo is valid
      if (!userInfo || !userInfo.email) {
        console.error('❌ CRITICAL ERROR - Invalid user info:', {
          userInfoExists: !!userInfo,
          userInfoValue: userInfo,
          hasEmail: !!(userInfo?.email),
          emailValue: userInfo?.email
        });
        throw new Error(`Authentication failed: No user information received. UserInfo: ${JSON.stringify(userInfo)}`);
      }
      
      const email = userInfo.email;
      
      // Get the Web3Auth ID token for secure authentication
      console.log('🔄 Getting Web3Auth ID token...');
      let idToken = null;
      try {
        // Get ID token from Web3Auth using the proper method
        idToken = await getIdToken();
        if (idToken) {
          console.log('✅ Got Web3Auth ID token:', {
            tokenLength: idToken.length,
            tokenStart: idToken.substring(0, 50) + '...',
            hasIdToken: !!idToken
          });
        } else {
          console.error('❌ getIdToken() returned null/undefined');
        }
      } catch (idTokenError) {
        console.error('⚠️ Could not get Web3Auth ID token:', idTokenError);
        console.error('🔍 ID Token error details:', {
          message: idTokenError instanceof Error ? idTokenError.message : idTokenError,
          stack: idTokenError instanceof Error ? idTokenError.stack : null
        });
        // Continue without ID token for now - we'll implement fallback
      }
      
      // FORCE CLEAN SESSION - Clear all old tokens for pure Web3Auth security
      sessionStorage.clear();
      localStorage.removeItem('secure_session_token');
      localStorage.removeItem('secure_user_data');
      localStorage.removeItem('userInfo');
      console.log('🧹 Cleared all old sessions - forcing pure Web3Auth authentication');
      
      // Generate device fingerprint for security binding
      const deviceFingerprint = FrontendSecurity.generateDeviceFingerprint();
      
      // First, authenticate with OAuth to get session tokens
      console.log('🔐 Authenticating OAuth user for:', email);
      console.log('📋 UserInfo details:', {
        email: userInfo.email,
        name: userInfo.name,
        verifierId: userInfo.verifierId,
        typeOfLogin: userInfo.typeOfLogin,
        aggregateVerifier: userInfo.aggregateVerifier
      });
      console.log('🔐 Device fingerprint generated for security binding');
      
      // CRITICAL: Track token length before JSON.stringify to detect truncation source
      const requestPayload = {
        email,
        userInfo,
        idToken: idToken, // Send the actual Web3Auth ID token
        deviceFingerprint: deviceFingerprint // Bind token to this device
      };
      
      console.log('🔍 TRUNCATION DEBUG - Before JSON.stringify:', {
        idTokenLength: idToken?.length || 0,
        isExactly1000: idToken?.length === 1000,
        idTokenPreview: idToken?.substring(0, 100) + '...',
        payloadObjectKeys: Object.keys(requestPayload)
      });
      
      const jsonPayload = JSON.stringify(requestPayload);
      console.log('🔍 TRUNCATION DEBUG - After JSON.stringify:', {
        jsonLength: jsonPayload.length,
        jsonPreview: jsonPayload.substring(0, 200) + '...',
        jsonEnd: jsonPayload.substring(jsonPayload.length - 200)
      });
      
      // Parse it back to check if idToken was truncated during JSON.stringify
      const reparsed = JSON.parse(jsonPayload);
      console.log('🔍 TRUNCATION DEBUG - After re-parsing JSON:', {
        reparsedIdTokenLength: reparsed.idToken?.length || 0,
        tokenPreserved: reparsed.idToken === idToken,
        lengthChanged: (reparsed.idToken?.length || 0) !== (idToken?.length || 0)
      });
      
      if (reparsed.idToken !== idToken) {
        console.error('🚨 CRITICAL: Token was modified during JSON.stringify/parse cycle!');
        console.error('🔍 Original vs Parsed:', {
          original: idToken?.substring(0, 100) + '...',
          parsed: reparsed.idToken?.substring(0, 100) + '...',
          lengthDiff: (idToken?.length || 0) - (reparsed.idToken?.length || 0)
        });
      }
      
      const authRes = await fetch(`/api/${process.env.NEXT_PUBLIC_API_AUTH_OAUTH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': deviceFingerprint,
          'X-Timestamp': Date.now().toString()
        },
        body: jsonPayload
      });
      
      console.log('🔍 OAuth response status:', authRes.status);
      
      if (!authRes.ok) {
        const errorText = await authRes.text();
        console.error('❌ OAuth authentication failed:', {
          status: authRes.status,
          statusText: authRes.statusText,
          error: errorText
        });
        throw new Error(`OAuth authentication failed: ${authRes.status} ${errorText}`);
      }
      
      const authData = await authRes.json();
      
      // Store Web3Auth authentication tokens
      if (authData.accessToken) {
        sessionStorage.setItem('accessToken', authData.accessToken);
        sessionStorage.setItem('refreshToken', authData.refreshToken);
        // Store user email for dashboard use (will be auth_email from Firebase if exists)
        sessionStorage.setItem('userEmail', authData.email);
        // Store Web3Auth metadata for proper authentication
        sessionStorage.setItem('authMethod', 'web3auth');
        sessionStorage.setItem('web3AuthProvider', userInfo.typeOfLogin || 'google');
        
        console.log(`✅ Web3Auth authentication stored for: ${authData.email} (${userInfo.typeOfLogin})`);
      } else {
        console.error('❌ No accessToken received from OAuth endpoint!');
        console.error('OAuth response data:', authData);
      }
      
      // 🔐 ALWAYS FETCH EXISTING WALLET FROM FIRESTORE (NO NEW WALLET GENERATION)
      console.log('🔄 Fetching existing wallet from Firestore');
      
      let privateKey;
      
      console.log('🔐 Checking for existing wallet with Web3Auth token...');
      // Use direct wallet access with Web3Auth JWT token
      const walletRes = await fetch(`/api/${process.env.NEXT_PUBLIC_API_USER_WALLET}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.accessToken}`,
          'X-Device-Fingerprint': deviceFingerprint,
          'X-Timestamp': Date.now().toString()
        },
        body: JSON.stringify({
          email: email
        })
      });
      
      if (!walletRes.ok) {
        const errorText = await walletRes.text();
        
        // Check if this is a "user not found" error
        if (walletRes.status === 404 || errorText.includes('user not found') || errorText.includes('MZS Wallet user not found')) {
          console.log('🧹 User not found in Firebase - clearing Web3Auth session to allow different email');
          
          // Clear Web3Auth session completely
          try {
            if (web3auth && web3auth.connected) {
              await web3auth.logout();
              console.log('✅ Web3Auth session cleared - user can try different email');
            }
            
            // Clear browser storage
            localStorage.removeItem('Web3Auth-cachedAdapter');
            sessionStorage.clear();
            localStorage.removeItem('userInfo');
            
            // Clear any auth data
            sessionStorage.removeItem('accessToken');
            sessionStorage.removeItem('refreshToken');
            
          } catch (clearError) {
            console.warn('⚠️ Session clear warning:', clearError);
          }
          
          throw new Error(`This email is not registered in MZS Wallet. Please use a different email or contact support.`);
        }
        
        throw new Error(`Wallet access failed: ${walletRes.status} ${errorText}`);
      }
      
      let data = await walletRes.json();
      console.log('🔍 Secure wallet response:', { 
        hasPrivateKey: !!(data.private_key || data.encryptedPrivateKey), 
        isEncrypted: !!data.encryptedPrivateKey,
        error: data.error 
      });
      
      if (data && (data.private_key || data.encryptedPrivateKey)) {
        // ✅ Use existing wallet from Firestore
        console.log('✅ Using existing wallet from Firestore with enhanced security');
        privateKey = data.encryptedPrivateKey || data.private_key;
        
        // Store secure session token if available
        if (data.sessionToken) {
          console.log('🔐 Storing secure session token from wallet API');
          sessionStorage.setItem('secure_session_token', data.sessionToken);
          sessionStorage.setItem('session_data', JSON.stringify(data.sessionData));
        }
      } else if (data && data.error === 'MZS Wallet user not found') {
        // 🌐 WEB: Only web can create new wallets with Web3Auth
        console.log('🌐 WEB: Creating new wallet with Web3Auth');
        if (!web3auth?.provider) throw new Error('Web3Auth provider not initialized');
        let privKey;
        if (web3auth.provider.request) {
          privKey = await web3auth.provider.request({ method: 'eth_private_key' });
        }
        if (!privKey) throw new Error('Could not get private key from Web3Auth');
        // 🔐 Save to backend with Web3Auth JWT token
        console.log('🔐 Creating wallet with Web3Auth authentication...');
        const createWalletRes = await fetch(`/api/${process.env.NEXT_PUBLIC_API_USER_WALLET}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.accessToken}`,
            'X-Device-Fingerprint': deviceFingerprint,
            'X-Timestamp': Date.now().toString()
          },
          body: JSON.stringify({
            email: email,
            private_key: privKey
          })
        });
        
        if (!createWalletRes.ok) {
          const errorText = await createWalletRes.text();
          throw new Error(`Wallet creation failed: ${createWalletRes.status} ${errorText}`);
        }
        
        data = await createWalletRes.json();
        console.log('✅ Wallet created securely with encryption');
        
        privateKey = data.encryptedPrivateKey || privKey;
        
        // Store secure session token if available for new wallet
        if (data.sessionToken) {
          console.log('🔐 Storing secure session token from new wallet creation');
          sessionStorage.setItem('secure_session_token', data.sessionToken);
          sessionStorage.setItem('session_data', JSON.stringify(data.sessionData));
        }
      } else {
        console.error('❌ Backend error:', data.error);
        throw new Error(data.error || 'Failed to fetch wallet from Firestore');
      }
      sessionStorage.setItem('walletPrivateKey', privateKey);
      if (data.user_id) {
        sessionStorage.setItem('userId', data.user_id);
      }
      // Don't store solana_address - let it be derived from private key
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
      setRedirecting(true);
      router.push('/dashboard');
    } catch (err) {
      console.error('❌ Authentication failed:', err);
      console.error('❌ Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : null,
        name: err instanceof Error ? err.name : null
      });
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to login with Google';
      
      // Try to close any stuck authentication popups
      try {
        closeAuthPopup();
        console.log('✅ Closed authentication popup after error');
      } catch (popupError) {
        console.log('⚠️ Popup close warning after error:', popupError);
      }
      
      // Check if this might be a timeout or authentication completion issue
      if (isMobile && (errorMessage.includes('timeout') || errorMessage.includes('Authentication timed out'))) {
        setError('인증이 완료되었을 수 있습니다. 앱을 확인하거나 다시 시도해주세요.');
      } else {
        setError(`인증 오류: ${errorMessage}`);
      }
      
      // Add a small delay to prevent immediate redirects
      setTimeout(() => {
        setIsLoading(false);
      }, 1000);
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
          
          {/* reCAPTCHA v2 Widget */}
          <div className="flex justify-center mb-4">
            <ReCAPTCHA
              ref={recaptchaV2Ref}
              sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6LePdAYsAAAAAEQQKplJh0SDkOIod-cPh-GiUENu"}
              onChange={(token) => {
                console.log('[CAPTCHA] Token received from Google:', token ? `Token length: ${token.length}` : 'null');
                setRecaptchaV2Token(token);
                setCaptchaError(null);
              }}
              onExpired={() => {
                console.log('[CAPTCHA] Token expired');
                setRecaptchaV2Token(null);
                setCaptchaError('reCAPTCHA가 만료되었습니다. 다시 확인해주세요.');
              }}
              onErrored={() => {
                console.error('[CAPTCHA] Error occurred');
                setRecaptchaV2Token(null);
                setCaptchaError('reCAPTCHA 로딩 실패. 네트워크를 확인하거나 페이지를 새로고침해주세요.');
              }}
              onLoad={() => {
                console.log('[CAPTCHA] reCAPTCHA loaded successfully');
              }}
              theme="light"
              size="normal"
            />
          </div>
          
          {(error || captchaError) && (
            <div className={`rounded-lg px-4 py-3 mb-2 text-center font-semibold shadow transition-all duration-200
              ${(error?.includes('successfully'))
                ? 'bg-green-100/80 text-green-700 border-l-4 border-green-500'
                : 'bg-red-100/80 text-red-700 border-l-4 border-red-500'}
            `}>
              <p>{captchaError || error}</p>
            </div>
          )}
          
          <button type="submit" className="btn" style={{ fontSize: '1.15em', marginBottom: 8 }} disabled={isLoading || !recaptchaV2Token}>
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
              {isLoading ? '연결 중...' : 'Google로 계속하기'}
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
              // Use enhanced wallet endpoint for migration success
              const deviceFingerprint = FrontendSecurity.generateDeviceFingerprint();
              const captchaToken = await executeRecaptcha('migration_complete');
              
              const res = await fetch('/api/user-wallet2025', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  email,
                  deviceFingerprint,
                  captchaToken: captchaToken || 'migration-flow'
                }),
              });
              
              const data = await res.json();
              if (res.ok && data.private_key) {
                sessionStorage.setItem('walletPrivateKey', String(data.private_key));
                
                // Store secure session if available
                if (data.sessionToken) {
                  sessionStorage.setItem('secure_session_token', data.sessionToken);
                  sessionStorage.setItem('session_data', JSON.stringify(data.sessionData));
                }
              }
            }
            router.push('/dashboard');
          }}
        />
      )}
    </div>
  );
} 