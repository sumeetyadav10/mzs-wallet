'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { FaGolfBall, FaRegCopy, FaExternalLinkAlt, FaUser, FaCheck, FaTimes } from 'react-icons/fa';

interface PasswordResetRequest {
  requestId: string;
  userId: string;
  identityProof: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface UserDetails {
  [key: string]: any;
}

const MZS_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const MZS_ADDRESS = "0x1aDb749FFDA33251e1503672951b5A4234518Fa7";

export default function AdminPanel() {
  console.log('Polygon RPC URL:', process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<PasswordResetRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [userDetailsLoading, setUserDetailsLoading] = useState(false);
  const [userDetailsError, setUserDetailsError] = useState<string | null>(null);
  const [userAddresses, setUserAddresses] = useState<Record<string, string>>({});
  const [mzsBalances, setMzsBalances] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchRequests();
    // Set up polling for real-time updates
    const interval = setInterval(fetchRequests, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Filter requests based on search term and status
    const filtered = requests.filter(request => {
      const matchesSearch = 
        request.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.identityProof.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
    setFilteredRequests(filtered);
  }, [requests, searchTerm, statusFilter]);

  useEffect(() => {
    console.log('All requests:', requests);
    console.log('Filtered requests:', filteredRequests);
  }, [requests, filteredRequests]);

  useEffect(() => {
    // Fetch wallet addresses for all userIds in filteredRequests
    const fetchAddresses = async () => {
      const newAddresses: Record<string, string> = {};
      await Promise.all(filteredRequests.map(async (request) => {
        try {
          const res = await fetch(`/api/admin/user-details?userId=${request.userId}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.user && data.user.address) {
            newAddresses[request.userId] = data.user.address;
          }
        } catch {}
      }));
      setUserAddresses(newAddresses);
    };
    if (filteredRequests.length > 0) fetchAddresses();
  }, [filteredRequests]);

  useEffect(() => {
    // Fetch MZS balances for all addresses
    const fetchBalances = async () => {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL;
        if (!rpcUrl) {
          console.error('NEXT_PUBLIC_POLYGON_RPC_URL is missing!');
          return;
        }
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
            await new Promise(res => setTimeout(res, 1000)); // Wait 1 second between batches
          }
        }
        setMzsBalances(newBalances);
      } catch (e) {
        console.error('Error setting up provider or contract:', e);
      }
    };
    if (Object.keys(userAddresses).length > 0) fetchBalances();
  }, [userAddresses]);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/admin/recovery-requests');
      if (!response.ok) {
        throw new Error('Failed to fetch requests');
      }
      const data = await response.json();
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch requests');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    setUserDetailsLoading(true);
    setUserDetailsError(null);
    setShowUserDetails(true);
    try {
      const res = await fetch(`/api/admin/user-details?userId=${userId}`);
      if (!res.ok) throw new Error('Failed to fetch user details');
      const data = await res.json();
      setUserDetails(data.user);
    } catch (err) {
      setUserDetailsError(err instanceof Error ? err.message : 'Failed to fetch user details');
      setUserDetails(null);
    } finally {
      setUserDetailsLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!confirm('Are you sure you want to approve this request?')) return;
    
    try {
      setError(null);
      const response = await fetch('/api/admin/approve-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      if (!response.ok) {
        throw new Error('Failed to approve request');
      }
      await fetchRequests(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    }
  };

  const handleReject = async (requestId: string) => {
    if (!confirm('Are you sure you want to reject this request?')) return;
    
    try {
      setError(null);
      const response = await fetch('/api/admin/reject-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      if (!response.ok) {
        throw new Error('Failed to reject request');
      }
      await fetchRequests(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    }
  };

  // Add a function to refresh the request list
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  if (error && error.toLowerCase().includes('access denied')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181A20]">
        <div className="text-2xl text-red-500 font-bold text-center">접근 거부<br /><span className="text-base text-white font-normal">이 페이지에 접근할 권한이 없습니다.</span></div>
      </div>
    );
  }

  if (isLoading && requests.length === 0) {
    return (
      <div className="min-h-screen bg-[#181A20] flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[var(--golf-gradient)]">
      <div className="golf-pattern absolute inset-0 pointer-events-none"></div>
      <div className="relative z-10 max-w-5xl mx-auto px-2 sm:px-6 py-8">
        {/* Header & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <FaGolfBall size={36} className="text-[var(--golf-gold)] drop-shadow" />
            <h1 className="text-3xl font-extrabold text-[var(--golf-green)] tracking-tight">비밀번호 재설정 요청</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="glass px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]"
              aria-label="상태 필터"
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
              className="glass w-full sm:w-64 px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]"
              aria-label="검색"
            />
            <button
              onClick={handleRefresh}
              className="glass px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold flex items-center gap-2 hover:bg-[var(--golf-gold)]/10 transition-all duration-200 focus:ring-2 focus:ring-[var(--golf-gold)]"
              disabled={refreshing}
            >
              {refreshing ? (
                <span className="animate-spin h-5 w-5 border-2 border-[var(--golf-gold)] border-t-transparent rounded-full"></span>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 003 12c0-5 4-9 9-9s9 4 9 9a9 9 0 01-1.356 4.707" /></svg>
              )}
              새로고침
            </button>
          </div>
        </div>
        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-semibold text-center">
            {error}
          </div>
        )}
        {/* Requests List */}
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
                  {/* Left: User Icon */}
                  <div className="flex items-center justify-center bg-gradient-to-br from-[var(--golf-gold)]/20 to-[var(--golf-green)]/10 p-6 sm:p-8">
                    <FaUser size={36} className="text-[var(--golf-green)]" />
                  </div>
                  {/* Right: Details */}
                  <div className="flex-1 p-6 sm:p-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                      <div>
                        <div className="text-xs text-[var(--golf-dark)]/60 font-semibold mb-1">사용자 ID</div>
                        <div className="font-mono text-[var(--golf-dark)] text-base font-bold break-all">{request.userId}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[var(--golf-dark)]/60 font-semibold mb-1">지갑 주소</div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[var(--golf-dark)] text-sm break-all">{userAddresses[request.userId] || <span className="text-red-400">찾을 수 없음</span>}</span>
                          {userAddresses[request.userId] && (
                            <>
                              <button
                                onClick={() => navigator.clipboard.writeText(userAddresses[request.userId])}
                                className="p-1 rounded-full hover:bg-[var(--golf-gold)]/20 focus:bg-[var(--golf-gold)]/30 transition"
                                aria-label="주소 복사"
                              >
                                <FaRegCopy className="text-[var(--golf-gold)]" size={16} />
                              </button>
                              <a
                                href={`https://polygonscan.com/address/${userAddresses[request.userId]}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded-full hover:bg-[var(--golf-gold)]/20 focus:bg-[var(--golf-gold)]/30 transition"
                                aria-label="Polygonscan에서 보기"
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
                              className="p-1 rounded-full hover:bg-[var(--golf-gold)]/20 focus:bg-[var(--golf-gold)]/30 transition"
                              aria-label="잔액 복사"
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
                        <div className="text-[var(--golf-dark)] text-sm">{new Date(request.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    {/* Divider */}
                    <div className="my-5 border-t border-[var(--golf-gold)]/10"></div>
                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => fetchUserDetails(request.userId)}
                        className="glass px-5 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold hover:bg-[var(--golf-gold)]/10 transition-all duration-200 focus:ring-2 focus:ring-[var(--golf-gold)]"
                      >
                        <FaUser className="inline mr-2" />사용자 정보
                      </button>
                      {request.status === 'pending' && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleApprove(request.requestId)}
                            className="glass px-5 py-2 rounded-xl border border-green-500/30 text-green-700 font-semibold hover:bg-green-500/10 transition-all duration-200 focus:ring-2 focus:ring-green-500 flex items-center gap-2"
                          >
                            <FaCheck /> 승인
                          </button>
                          <button
                            onClick={() => handleReject(request.requestId)}
                            className="glass px-5 py-2 rounded-xl border border-red-500/30 text-red-600 font-semibold hover:bg-red-500/10 transition-all duration-200 focus:ring-2 focus:ring-red-500 flex items-center gap-2"
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
        {/* User Details Modal */}
        {showUserDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass p-8 rounded-2xl max-w-lg w-full mx-4 border border-[var(--golf-gold)]/30 animate-float relative">
              <button
                className="absolute top-4 right-4 text-[var(--golf-dark)]/60 hover:text-[var(--golf-dark)] focus:ring-2 focus:ring-[var(--golf-gold)]"
                onClick={() => setShowUserDetails(false)}
                aria-label="닫기"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="text-2xl font-bold text-[var(--golf-green)] mb-6">사용자 정보</h2>
              {userDetailsLoading ? (
                <div className="flex justify-center py-8">
                  <span className="animate-spin h-8 w-8 border-2 border-[var(--golf-gold)] border-t-transparent rounded-full"></span>
                </div>
              ) : userDetailsError ? (
                <div className="text-red-500 font-semibold text-center">{userDetailsError}</div>
              ) : userDetails ? (
                <div className="space-y-3 text-[var(--golf-dark)]">
                  {Object.entries(userDetails)
                    .filter(([key]) => !['password_hash', 'private_key', 'mnemonic', 'seed'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="glass p-3 rounded-xl border border-[var(--golf-gold)]/20">
                        <span className="text-xs text-[var(--golf-dark)]/60 block mb-1 font-semibold">{key}</span>
                        <span className="break-all text-base font-medium">{String(value)}</span>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 