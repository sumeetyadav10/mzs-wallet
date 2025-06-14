"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { FaGolfBall } from 'react-icons/fa';

export default function ForgotPassword() {
  const [step, setStep] = useState<"address" | "showUid" | "reset" | "done">("address");
  const [address, setAddress] = useState("");
  const [userId, setUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [identityProof, setIdentityProof] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Step 1: Find user by address and submit request
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      // Find UID by address
      const res = await fetch("/api/auth/find-user-by-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "User not found");
      setUserId(data.user_id);
      // Submit password reset request
      const reqRes = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          userId: data.user_id,
          requestedPassword: newPassword,
          identityProof,
        }),
      });
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.error || "Failed to submit request");
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
      setError("Passwords do not match");
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
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setStep("done");
      // Import wallet after password reset
      const pkRes = await fetch("/api/auth/get-private-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const pkData = await pkRes.json();
      if (!pkRes.ok) throw new Error(pkData.error || "Failed to import wallet");
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
        <h1 style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: '2rem', marginBottom: 8 }}>Forgot Password</h1>
        {step === "address" && (
          <form onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Wallet Address"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New Password"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <textarea
              value={identityProof}
              onChange={e => setIdentityProof(e.target.value)}
              placeholder="Identity Proof (e.g. old password, email, etc.)"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <button type="submit" className="btn" style={{ fontSize: '1.1em', marginBottom: 8 }} disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Request'}
            </button>
            {error && <div style={{ color: 'red', marginBottom: 8, fontWeight: 600 }}>{error}</div>}
          </form>
        )}
        {step === "showUid" && (
          <div style={{ color: 'var(--primary)', fontWeight: 600, margin: '24px 0' }}>
            <div>Request sent for review.</div>
            <div>User ID (UID): <span style={{ color: 'var(--accent)' }}>{userId}</span></div>
            <div style={{ color: 'var(--text)', fontSize: 14, marginTop: 8 }}>Wait for admin approval. You can log in once approved.</div>
            <button className="btn" style={{ marginTop: 16, background: 'var(--accent)', color: 'var(--text)' }} onClick={() => router.push("/")}>Back to Login</button>
          </div>
        )}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New Password"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              required
              style={{ marginBottom: 12 }}
              disabled={isLoading}
            />
            <button type="submit" className="btn" style={{ fontSize: '1.1em', marginBottom: 8 }} disabled={isLoading}>
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>
            {error && <div style={{ color: 'red', marginBottom: 8, fontWeight: 600 }}>{error}</div>}
          </form>
        )}
        {step === "done" && (
          <div style={{ color: 'var(--golf-green)', fontWeight: 700, fontSize: 18, margin: '24px 0' }}>Password reset successful! Importing wallet and logging in...</div>
        )}
      </div>
    </div>
  );
} 