'use client';

import { useState, useEffect, useRef } from 'react';
import { FaGolfBall, FaRegCopy, FaExternalLinkAlt, FaUser, FaCheck, FaTimes, FaSearch, FaSpinner } from 'react-icons/fa';
import SuperSearch from './components/SuperSearch';
import UserManager from './components/UserManager';
import { ethers } from 'ethers';
import { adminApi, AdminApiError } from '@/lib/adminApi';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { useRouter } from 'next/navigation';

interface PasswordResetRequest {
  requestId: string;
  userId: string;
  identityProof: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface SearchResult {
  docId: string;
  matchedField: string;
  matchType?: 'exact' | 'partial';
  user_id?: string;
  auth_email?: string;
  address?: string;
  [key: string]: any;
}


const MZS_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const MZS_ADDRESS = "0x1aDb749FFDA33251e1503672951b5A4234518Fa7";

export default function AdminPanel() {
  const router = useRouter();
  const { user, isAdmin, loading: authLoading, sessionToken, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'recovery' | 'search'>('recovery');
  
  // Recovery requests state
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<PasswordResetRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [userAddresses, setUserAddresses] = useState<Record<string, string>>({});
  const [mzsBalances, setMzsBalances] = useState<Record<string, string>>({});
  
  // User management state
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [showUserManager, setShowUserManager] = useState(false);
  
  // Common state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Track active async operations
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true);
    
    // Cleanup function
    return () => {
      // Cancel any pending requests on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    // Only redirect after mount to avoid hydration issues
    if (mounted && !authLoading && (!user || !isAdmin || !sessionToken)) {
      setRedirecting(true);
      router.push('/admin/login');
    }
  }, [mounted, authLoading, user, isAdmin, sessionToken, router]);

  // Load recovery requests on mount and tab change
  useEffect(() => {
    // Only fetch data if mounted and user is authenticated
    if (mounted && !authLoading && user && isAdmin && sessionToken) {
      if (activeTab === 'recovery') {
        fetchRequests();
      }
    }
  }, [activeTab, mounted, authLoading, user, isAdmin, sessionToken]);

  // Filter recovery requests
  useEffect(() => {
    const filtered = requests.filter(request => {
      const matchesSearch = 
        request.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.identityProof.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
    setFilteredRequests(filtered);
  }, [requests, searchTerm, statusFilter]);

  // Fetch addresses and balances for recovery requests
  useEffect(() => {
    const fetchAddresses = async () => {
      // Only fetch if user is authenticated
      if (!user || !isAdmin) return;
      
      // Only fetch addresses for userIds we don't already have
      const missingUserIds = filteredRequests
        .map(req => req.userId)
        .filter(userId => !userAddresses[userId]);
      
      if (missingUserIds.length === 0) return;
      
      const newAddresses: Record<string, string> = {};
      
      // Batch requests in groups of 5 to avoid overwhelming the server
      const batchSize = 5;
      for (let i = 0; i < missingUserIds.length; i += batchSize) {
        const batch = missingUserIds.slice(i, i + batchSize);
        await Promise.all(batch.map(async (userId) => {
          try {
            const res = await fetch(`/api/admin/user-details?userId=${userId}`, {
              headers: {
                'Authorization': `Bearer ${await user.getIdToken()}`,
              },
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.user && data.user.address) {
              newAddresses[userId] = data.user.address;
            }
          } catch {}
        }));
        
        // Add a small delay between batches to be nice to the server
        if (i + batchSize < missingUserIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Only update state if we have new addresses
      if (Object.keys(newAddresses).length > 0) {
        setUserAddresses(prev => ({ ...prev, ...newAddresses }));
      }
    };
    
    if (filteredRequests.length > 0 && user && isAdmin) {
      fetchAddresses();
    }
  }, [filteredRequests, user, isAdmin, userAddresses]);

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL;
        if (!rpcUrl) return;
        
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(MZS_ADDRESS, MZS_ABI, provider);
        const decimals = await contract.decimals();
        const newBalances: Record<string, string> = {};
        
        const entries = Object.entries(userAddresses);
        const batchSize = 5;
        for (let i = 0; i < entries.length; i += batchSize) {
          const batch = entries.slice(i, i + batchSize);
          await Promise.all(batch.map(async ([userId, address]) => {
            if (address && ethers.isAddress(address)) {
              try {
                const raw = await contract.balanceOf(address);
                const formatted = ethers.formatUnits(raw, decimals);
                newBalances[userId] = formatted;
              } catch (e) {
                newBalances[userId] = '0';
              }
            }
          }));
          if (i + batchSize < entries.length) {
            await new Promise(res => setTimeout(res, 1000));
          }
        }
        setMzsBalances(newBalances);
      } catch (e) {
        console.error('Error fetching balances:', e);
      }
    };
    if (Object.keys(userAddresses).length > 0) fetchBalances();
  }, [userAddresses]);

  const fetchRequests = async () => {
    // Check if mounted before starting
    if (!mounted) return;
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getRecoveryRequests();
      
      // Check if still mounted and not aborted
      if (!abortController.signal.aborted && mounted) {
        setRequests(data.requests);
      }
    } catch (err) {
      // Don't update state if unmounted or aborted
      if (abortController.signal.aborted || !mounted) return;
      
      // Don't set error state for authentication errors to prevent infinite loops
      if (err instanceof AdminApiError && err.message.includes('인증')) {
        console.log('Authentication error in fetchRequests, not setting error state');
        return;
      }
      setError(err instanceof AdminApiError ? err.message : '복구 요청을 가져오는 중 오류가 발생했습니다.');
    } finally {
      if (!abortController.signal.aborted && mounted) {
        setLoading(false);
      }
    }
  };


  const handleApprove = async (requestId: string) => {
    if (!confirm('이 요청을 승인하시겠습니까?')) return;
    
    try {
      setError(null);
      await adminApi.approveRecovery(requestId);
      await fetchRequests();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : '요청 승인 중 오류가 발생했습니다.');
    }
  };

  const handleReject = async (requestId: string) => {
    if (!confirm('이 요청을 거부하시겠습니까?')) return;
    
    try {
      setError(null);
      await adminApi.rejectRecovery(requestId);
      await fetchRequests();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : '요청 거부 중 오류가 발생했습니다.');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'recovery') {
      await fetchRequests();
    }
    setRefreshing(false);
  };

  const handleUserSelect = async (searchResult: SearchResult) => {
    setSelectedUser(searchResult);
    setShowUserManager(true);
  };

  const handleUserUpdated = () => {
    // Refresh current tab data if needed
  };

  // Show loading state while authentication is being checked or not mounted
  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--golf-gradient)]">
        <div className="golf-pattern absolute inset-0 pointer-events-none"></div>
        <div className="relative z-10 text-center">
          <FaSpinner className="animate-spin text-[var(--golf-gold)] mx-auto mb-4" size={48} />
          <div className="text-[var(--golf-dark)] font-semibold text-lg">
            인증 확인 중...
          </div>
        </div>
      </div>
    );
  }

  // Redirect or show nothing if not authenticated
  if (!user || !isAdmin || !sessionToken) {
    if (redirecting) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--golf-gradient)]">
          <div className="golf-pattern absolute inset-0 pointer-events-none"></div>
          <div className="relative z-10 text-center">
            <FaSpinner className="animate-spin text-[var(--golf-gold)] mx-auto mb-4" size={48} />
            <div className="text-[var(--golf-dark)] font-semibold text-lg">
              관리자 로그인으로 이동 중...
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[var(--golf-gradient)]">
      <div className="golf-pattern absolute inset-0 pointer-events-none"></div>
      <div className="relative z-10 max-w-6xl mx-auto px-2 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <FaGolfBall size={36} className="text-[var(--golf-gold)] drop-shadow" />
            <div>
              <h1 className="text-3xl font-extrabold text-[var(--golf-green)] tracking-tight">MZS 관리자 패널</h1>
              <p className="text-[var(--golf-dark)]/70 font-medium">관리자 전용 패널</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="glass px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold flex items-center gap-2 hover:bg-[var(--golf-gold)]/10 transition-all duration-200"
            >
              {refreshing ? (
                <FaSpinner className="animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 003 12c0-5 4-9 9-9s9 4 9 9a9 9 0 01-1.356 4.707" />
                </svg>
              )}
              새로고침
            </button>
            <button
              onClick={logout}
              className="glass px-4 py-2 rounded-xl border border-red-500/30 text-red-600 font-semibold flex items-center gap-2 hover:bg-red-500/10 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              로그아웃
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="glass rounded-2xl border border-[var(--golf-gold)]/20 mb-8 p-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('recovery')}
              className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'recovery'
                  ? 'bg-[var(--golf-gold)]/20 text-[var(--golf-green)] border border-[var(--golf-gold)]/30'
                  : 'text-[var(--golf-dark)]/70 hover:bg-[var(--golf-gold)]/10'
              }`}
            >
              <FaUser />
              복구 요청
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'search'
                  ? 'bg-[var(--golf-gold)]/20 text-[var(--golf-green)] border border-[var(--golf-gold)]/30'
                  : 'text-[var(--golf-dark)]/70 hover:bg-[var(--golf-gold)]/10'
              }`}
            >
              <FaSearch />
              사용자 검색
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-semibold text-center">
            {error}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'recovery' && (
          <div>
            <div className="flex flex-col sm:flex-row gap-2 mb-6">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="glass px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]"
              >
                <option value="all">전체 상태</option>
                <option value="pending">대기 중</option>
                <option value="approved">승인됨</option>
                <option value="rejected">거부됨</option>
              </select>
              <input
                type="text"
                placeholder="사용자 또는 증명으로 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="glass flex-1 px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]"
              />
            </div>

            {loading && requests.length === 0 ? (
              <div className="glass p-10 rounded-2xl text-center">
                <FaSpinner className="animate-spin text-[var(--golf-gold)] mx-auto mb-4" size={32} />
                <div className="text-[var(--golf-dark)] font-semibold">로딩 중...</div>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredRequests.length === 0 ? (
                  <div className="glass p-10 rounded-2xl text-center text-[var(--golf-dark)] font-semibold text-lg shadow-lg">
                    {requests.length === 0 ? '요청이 없습니다.' : '일치하는 요청이 없습니다.'}
                  </div>
                ) : (
                  filteredRequests.map((request) => (
                    <div
                      key={request.requestId}
                      className="glass rounded-2xl border border-[var(--golf-gold)]/20 shadow-xl p-0 overflow-hidden animate-float"
                    >
                      <div className="flex flex-col sm:flex-row">
                        <div className="flex items-center justify-center bg-gradient-to-br from-[var(--golf-gold)]/20 to-[var(--golf-green)]/10 p-6 sm:p-8">
                          <FaUser size={36} className="text-[var(--golf-green)]" />
                        </div>
                        <div className="flex-1 p-6 sm:p-8">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                            <div>
                              <div className="text-xs text-[var(--golf-dark)]/60 font-semibold mb-1">사용자 ID</div>
                              <div className="font-mono text-[var(--golf-dark)] text-base font-bold break-all">{request.userId}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--golf-dark)]/60 font-semibold mb-1">지갑 주소</div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[var(--golf-dark)] text-sm break-all">
                                  {userAddresses[request.userId] || <span className="text-red-400">찾을 수 없음</span>}
                                </span>
                                {userAddresses[request.userId] && (
                                  <>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(userAddresses[request.userId])}
                                      className="p-1 rounded-full hover:bg-[var(--golf-gold)]/20 transition"
                                    >
                                      <FaRegCopy className="text-[var(--golf-gold)]" size={16} />
                                    </button>
                                    <a
                                      href={`https://polygonscan.com/address/${userAddresses[request.userId]}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 rounded-full hover:bg-[var(--golf-gold)]/20 transition"
                                    >
                                      <FaExternalLinkAlt className="text-[var(--golf-gold)]" size={15} />
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--golf-dark)]/60 font-semibold mb-1">MZS 잔액</div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[var(--golf-gold)] text-base">
                                  {mzsBalances[request.userId] !== undefined ? mzsBalances[request.userId] : '조회 중...'}
                                </span>
                                {userAddresses[request.userId] && (
                                  <button
                                    onClick={() => navigator.clipboard.writeText(mzsBalances[request.userId] || '0')}
                                    className="p-1 rounded-full hover:bg-[var(--golf-gold)]/20 transition"
                                  >
                                    <FaRegCopy className="text-[var(--golf-gold)]" size={15} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--golf-dark)]/60 font-semibold mb-1">신원 증명</div>
                              <div className="text-[var(--golf-dark)] text-sm break-words font-medium">{request.identityProof}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--golf-dark)]/60 font-semibold mb-1">요청 시간</div>
                              <div className="text-[var(--golf-dark)] text-sm">{new Date(request.createdAt).toLocaleString('ko-KR')}</div>
                            </div>
                          </div>
                          <div className="my-5 border-t border-[var(--golf-gold)]/10"></div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            {request.status === 'pending' && (
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handleApprove(request.requestId)}
                                  className="glass px-5 py-2 rounded-xl border border-green-500/30 text-green-700 font-semibold hover:bg-green-500/10 transition-all duration-200 flex items-center gap-2"
                                >
                                  <FaCheck /> 승인
                                </button>
                                <button
                                  onClick={() => handleReject(request.requestId)}
                                  className="glass px-5 py-2 rounded-xl border border-red-500/30 text-red-600 font-semibold hover:bg-red-500/10 transition-all duration-200 flex items-center gap-2"
                                >
                                  <FaTimes /> 거부
                                </button>
                              </div>
                            )}
                            {request.status !== 'pending' && (
                              <div className="flex items-center">
                                <span className={`px-4 py-2 rounded-full text-sm font-bold border ${
                                  request.status === 'approved'
                                    ? 'bg-green-500/10 text-green-700 border-green-500/30'
                                    : 'bg-red-500/10 text-red-600 border-red-500/30'
                                }`}>
                                  {request.status === 'approved' ? '승인됨' : '거부됨'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'search' && (
          <div>
            <SuperSearch onUserSelect={handleUserSelect} />
          </div>
        )}

        {/* User Manager Modal */}
        {showUserManager && selectedUser && (
          <UserManager
            user={selectedUser}
            onClose={() => {
              setShowUserManager(false);
              setSelectedUser(null);
            }}
            onUserUpdated={handleUserUpdated}
          />
        )}
      </div>
    </div>
  );
} 