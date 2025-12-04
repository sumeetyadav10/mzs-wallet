import React, { useState } from "react";
import { useWeb3Auth } from "@/lib/web3auth/Web3AuthProvider";

interface MigrationModalProps {
  legacyUserId: string; // The legacy user identifier (e.g., user ID or wallet address)
  onSuccess: () => void;
}

const MigrationModal: React.FC<MigrationModalProps> = ({ legacyUserId, onSuccess }) => {
  const { connect, isLoading, isConnected, getUserInfo } = useWeb3Auth();
  const [status, setStatus] = useState<"idle" | "migrating" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleMigrate = async () => {
    setStatus("migrating");
    setError(null);
    try {
      await connect();
      const userInfo = await getUserInfo();
      
      // Get the session token from sessionStorage
      const accessToken = sessionStorage.getItem('accessToken');
      if (!accessToken) {
        throw new Error('Session expired. Please login again.');
      }
      
      // Call backend to link Google email to legacy wallet
      const res = await fetch(`/api/${process.env.NEXT_PUBLIC_API_AUTH_MIGRATE}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          legacyUserId,
          googleEmail: userInfo.email,
        }),
      });
      if (!res.ok) throw new Error("Migration failed");
      setStatus("success");
      setTimeout(onSuccess, 1500);
    } catch (e: any) {
      setStatus("error");
      setError(e.message || "Migration failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8 max-w-sm w-full text-center">
        <div className="mb-4 text-2xl font-semibold text-yellow-600">⚠️ 이메일 인증이 필요합니다</div>
        <div className="mb-6 text-gray-700 dark:text-gray-200">
          구글 로그인을 사용하여 계속하세요.
        </div>
        {status === "success" ? (
          <div className="text-green-600 font-bold">Migration successful! Redirecting…</div>
        ) : (
          <button
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            onClick={handleMigrate}
            disabled={isLoading || status === "migrating"}
          >
            {status === "migrating" || isLoading ? "Logging in…" : "Login with Google"}
          </button>
        )}
        {status === "error" && <div className="mt-4 text-red-600">{error}</div>}
      </div>
    </div>
  );
};

export default MigrationModal; 