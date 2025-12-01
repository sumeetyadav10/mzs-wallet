"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { FaGolfBall, FaShieldAlt } from 'react-icons/fa';
import { useCaptcha } from '@/components/security/CaptchaProvider';
import ReCAPTCHA from 'react-google-recaptcha';

export default function ForgotPassword() {
  const [step, setStep] = useState<"address" | "showUid" | "reset" | "done">("address");
  const [address, setAddress] = useState("");
  const [userId, setUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [identityProof, setIdentityProof] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaValue, setCaptchaValue] = useState<string | null>(null);
  const router = useRouter();
  const { executeRecaptcha } = useCaptcha();
  
  // Debug: Check reCAPTCHA configuration
  console.log('reCAPTCHA site key configured:', !!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);

  // Step 1: Find user by address and submit request
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      // CAPTCHA verification - REQUIRED for security
      console.log('🔒 Verifying CAPTCHA for forgot password...');
      
      let token = captchaValue; // Use visible reCAPTCHA first
      
      if (!token) {
        // Fallback to invisible reCAPTCHA v3
        console.log('🔒 Executing invisible reCAPTCHA v3...');
        token = await executeRecaptcha('forgot_password');
      }
      
      if (!token) {
        setError('CAPTCHA 인증이 필요합니다. reCAPTCHA를 완료하고 다시 시도해주세요.');
        setIsLoading(false);
        return;
      }
      console.log('✅ CAPTCHA verification successful');
      setCaptchaToken(token);
      // Find UID by address with CAPTCHA token
      const res = await fetch("/api/auth2025/auth/find-user-by-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          address,
          captchaToken: token // Include CAPTCHA token for this API too
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "사용자를 찾을 수 없습니다");
      setUserId(data.user_id);
      // Submit password reset request (CAPTCHA already verified in find-user step)
      const reqRes = await fetch("/api/auth2025/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          userId: data.user_id,
          requestedPassword: newPassword,
          identityProof,
          // Don't send the same CAPTCHA token - it's already been used
        }),
      });
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.error || "요청 제출에 실패했습니다");
      setStep("showUid");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "비밀번호 재설정에 실패했습니다");
      setStep("done");
      // Import wallet after password reset
      const pkRes = await fetch("/api/auth/get-private-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const pkData = await pkRes.json();
      if (!pkRes.ok) throw new Error(pkData.error || "지갑 가져오기에 실패했습니다");
      sessionStorage.setItem("walletPrivateKey", pkData.private_key);
      sessionStorage.setItem("userId", userId);
      // Optionally, you can trigger a reload or redirect
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', background: 'var(--golf-gradient)', borderRadius: '18px', boxShadow: 'var(--golf-shadow)', padding: '2em 0' }}>
      <div className="card" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center', position: 'relative', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1.5px solid #e6c20022', boxShadow: '0 8px 32px rgba(46, 125, 50, 0.18)' }}>
        <FaGolfBall size={48} color="var(--golf-gold)" style={{ marginBottom: 16 }} />
        <h1 style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: '2rem', marginBottom: 8 }}>비밀번호 찾기</h1>
        {step === "address" && (
          <form onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="지갑 주소"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="새 비밀번호"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <textarea
              value={identityProof}
              onChange={e => setIdentityProof(e.target.value)}
              placeholder="신원 증명 (예: 이전 비밀번호, 이메일 등)"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            {/* CAPTCHA Widget */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              marginBottom: '16px',
              padding: '12px',
              background: 'rgba(26, 219, 116, 0.1)', 
              border: '1px solid rgba(26, 219, 116, 0.3)', 
              borderRadius: '8px'
            }}>
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
              }}>
                <FaShieldAlt color="var(--golf-green)" size={16} />
                <span style={{ fontSize: '0.9em', color: 'var(--golf-green)', fontWeight: 600 }}>
                  보안 인증 (reCAPTCHA)
                </span>
              </div>
              
              {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ? (
                <ReCAPTCHA
                  sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                  onChange={(value) => {
                    console.log('reCAPTCHA value changed:', value);
                    setCaptchaValue(value);
                  }}
                  onExpired={() => {
                    console.log('reCAPTCHA expired');
                    setCaptchaValue(null);
                  }}
                  onError={() => {
                    console.log('reCAPTCHA error');
                    setCaptchaValue(null);
                  }}
                  theme="light"
                  size="normal"
                />
              ) : (
                <div style={{
                  padding: '12px 20px',
                  background: 'rgba(255, 193, 7, 0.2)',
                  border: '1px solid rgba(255, 193, 7, 0.5)',
                  borderRadius: '6px',
                  color: '#856404',
                  fontSize: '0.85em',
                  textAlign: 'center'
                }}>
                  🔧 개발 모드: reCAPTCHA 자동 승인됨
                </div>
              )}
            </div>
            
            <button 
              type="submit" 
              className="btn" 
              style={{ 
                fontSize: '1.1em', 
                marginBottom: 8,
                opacity: (!captchaValue && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) ? 0.5 : 1
              }} 
              disabled={isLoading || (!captchaValue && !!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY)}
            >
              {isLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <FaShieldAlt /> 보안 검증 중...
                </span>
              ) : (!captchaValue && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <FaShieldAlt /> reCAPTCHA 완료 필요
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <FaShieldAlt /> 보안 인증 후 전송
                </span>
              )}
            </button>
            {error && <div style={{ color: 'red', marginBottom: 8, fontWeight: 600 }}>{error}</div>}
          </form>
        )}
        {step === "showUid" && (
          <div style={{ color: 'var(--primary)', fontWeight: 600, margin: '24px 0' }}>
            <div>검토를 위해 요청이 전송되었습니다.</div>
            <div>사용자 ID (UID): <span style={{ color: 'var(--accent)' }}>{userId}</span></div>
            <div style={{ color: 'var(--text)', fontSize: 14, marginTop: 8 }}>관리자 승인을 기다려주세요. 승인되면 로그인할 수 있습니다.</div>
            <button className="btn" style={{ marginTop: 16, background: 'var(--accent)', color: 'var(--text)' }} onClick={() => router.push("/")}>로그인으로 돌아가기</button>
          </div>
        )}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="새 비밀번호"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 확인"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <button type="submit" className="btn" style={{ fontSize: '1.1em', marginBottom: 8 }} disabled={isLoading}>
              {isLoading ? '재설정 중...' : '비밀번호 재설정'}
            </button>
            {error && <div style={{ color: 'red', marginBottom: 8, fontWeight: 600 }}>{error}</div>}
          </form>
        )}
        {step === "done" && (
          <div style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: 18, margin: '24px 0' }}>비밀번호 재설정 성공! 지갑을 가져와 로그인 중입니다...</div>
        )}
      </div>
    </div>
  );
} 