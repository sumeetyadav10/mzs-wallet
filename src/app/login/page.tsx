"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWeb3Auth } from "@/lib/web3auth/Web3AuthProvider";
import MigrationModal from "@/components/MigrationModal";
import { FcGoogle } from "react-icons/fc";

export default function LoginPage() {
  const router = useRouter();
  const { web3auth, connect, isConnected, getUserInfo } = useWeb3Auth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  const [legacyUserId, setLegacyUserId] = useState<string | null>(null);
  const [showOldUserModal, setShowOldUserModal] = useState(false);
  const [oldUserEmail, setOldUserEmail] = useState("");
  const [oldUserPassword, setOldUserPassword] = useState("");
  const [oldUserError, setOldUserError] = useState<string | null>(null);
  const [oldUserLoading, setOldUserLoading] = useState(false);
  const [agreeNewUser, setAgreeNewUser] = useState(false);

  const handleLegacyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        setIsLoading(false);
        return;
      }
      // Handle migration or dashboard redirect as before
      if (data.auth_email) {
        setShowMigration(false);
        setLegacyUserId(null);
        setError('You have already migrated your wallet. Please sign in with Google.');
        setIsLoading(false);
        return;
      }
      if (data.private_key && !data.auth_email) {
        setLegacyUserId(data.user_id);
        setShowMigration(true);
        setIsLoading(false);
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError("Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleWeb3AuthLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await connect();
      const userInfo = await getUserInfo();
      // Store user info in session/local storage
      localStorage.setItem("userInfo", JSON.stringify(userInfo));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login with Web3Auth");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMigrate = async (newAddress: string) => {
    if (!legacyUserId) return;
    try {
      const response = await fetch("/api/auth/migrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          legacyUserId,
          newAddress,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to migrate wallet");
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to migrate wallet");
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
        setOldUserError(data.error || 'Login failed');
        setOldUserLoading(false);
        return;
      }
      // Handle migration or dashboard redirect as before
      if (data.auth_email) {
        setOldUserError('You have already migrated your wallet. Please sign in with Google.');
        setOldUserLoading(false);
        return;
      }
      if (data.private_key && !data.auth_email) {
        setShowMigration(true);
        setLegacyUserId(data.user_id);
        setShowOldUserModal(false);
        setOldUserLoading(false);
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setOldUserError("Login failed");
    } finally {
      setOldUserLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign in to your account
          </h2>
        </div>

        {/* WARNING & CHECKBOX */}
        <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 rounded">
          <div className="mb-2 font-semibold">
            If you are an <span className="text-red-600 font-bold">old user</span> and want your old wallet, please migrate first using your username and password.<br />
            If you don't know your password, use <span className="underline">Forgot Password</span>.
          </div>
          <div className="flex items-center mt-2">
            <input
              type="checkbox"
              id="agreeNewUser"
              checked={agreeNewUser}
              onChange={e => setAgreeNewUser(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="agreeNewUser" className="text-sm">I am a brand new user and want to create a new wallet.</label>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <button
            onClick={handleWeb3AuthLogin}
            disabled={isLoading || !agreeNewUser}
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${agreeNewUser ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
          >
            {isLoading ? "Connecting..." : "Continue with Google"}
          </button>
          <button
            type="button"
            className="w-full mt-2 py-2 px-4 rounded-md border border-yellow-400 text-yellow-800 font-semibold bg-yellow-50 hover:bg-yellow-100"
            onClick={() => setShowOldUserModal(true)}
          >
            Old user? Click here
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500">
                Or continue with email
              </span>
            </div>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleLegacyLogin}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Email address"
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={() => console.log("Sign in button clicked")}
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Old User Modal */}
      {showOldUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-yellow-400">
            <div className="mb-4 text-2xl font-bold text-yellow-600 flex items-center justify-center gap-2">
              Old User Login
            </div>
            <form onSubmit={handleOldUserLogin} className="space-y-4">
              <input
                type="text"
                placeholder="Username or Email"
                value={oldUserEmail}
                onChange={e => setOldUserEmail(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
              <input
                type="password"
                placeholder="Password"
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
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="text-gray-500 text-sm"
                  onClick={() => setShowOldUserModal(false)}
                >
                  Cancel
                </button>
              </div>
              {oldUserError && <div className="text-red-600 text-sm font-semibold mt-2">{oldUserError}</div>}
              <button
                type="submit"
                className="w-full mt-2 py-2 px-4 rounded-md bg-yellow-500 text-white font-bold hover:bg-yellow-600"
                disabled={oldUserLoading}
              >
                {oldUserLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showMigration && legacyUserId && !error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-[#23262F] rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-blue-400">
            <div className="mb-4 text-2xl font-bold text-yellow-600 flex items-center justify-center gap-2">
              <svg className="w-7 h-7 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>
              Email Authentication is Now Mandatory
            </div>
            <div className="mb-6 text-gray-700 dark:text-gray-200 text-center">
              Please use Google login to continue.
            </div>
            <button
              className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow hover:from-blue-600 hover:to-blue-800 transition-all duration-200"
              onClick={() => {
                setShowMigration(false);
                setLegacyUserId(null);
                router.push('/');
              }}
            >
              Login with Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 