'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaSearch, FaUser, FaSpinner, FaTimes } from 'react-icons/fa';
import { useAdminAuth } from '@/lib/AdminAuthContext';


interface SearchResult {
  documentId: string;
  matchField: string;
  matchType: 'exact' | 'partial';
  user_id?: string;
  auth_email?: string;
  address?: string;
  created_at?: string;
  migratedAt?: string;
  [key: string]: any;
}

interface SuperSearchProps {
  onUserSelect: (user: SearchResult) => void;
}

const SEARCH_FIELDS = [
  { value: '', label: '전체 필드' },
  { value: 'user_id', label: '사용자 ID' },
  { value: 'auth_email', label: '이메일' },
  { value: 'address', label: '지갑 주소' }
];

export default function SuperSearch({ onUserSelect }: SuperSearchProps) {
  const { user } = useAdminAuth();
  const [query, setQuery] = useState('');
  const [selectedField, setSelectedField] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const performSearch = useCallback(async (searchQuery: string, searchField: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    if (!user) {
      setError('인증이 필요합니다.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/search-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          field: searchField || undefined // Send undefined for all fields
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('인증이 필요합니다.');
        }
        throw new Error('검색 요청이 실패했습니다.');
      }

      const data = await response.json();
      console.log('Search response:', data);
      setResults(data.results || []);
      setShowResults(true);
      
      if (data.results && data.results.length === 0) {
        setError(null); // Don't show error for empty results
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.');
      setResults([]);
      setShowResults(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        performSearch(query.trim(), selectedField);
      } else {
        setResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, selectedField, performSearch]);

  const handleUserSelect = (user: SearchResult) => {
    onUserSelect(user);
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setError(null);
  };

  const formatFieldValue = (value: any, field: string): string => {
    if (!value) return '없음';
    
    if (field === 'created_at' || field === 'migratedAt') {
      try {
        return new Date(value).toLocaleString('ko-KR');
      } catch {
        return String(value);
      }
    }
    
    if (field === 'address' && typeof value === 'string' && value.length > 10) {
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    }
    
    return String(value);
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedField}
          onChange={(e) => setSelectedField(e.target.value)}
          className="glass px-3 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]"
        >
          {SEARCH_FIELDS.map(field => (
            <option key={field.value} value={field.value}>
              {field.label}
            </option>
          ))}
        </select>
        
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="사용자 검색... (최소 2자)"
            className="glass w-full px-4 py-2 pl-10 pr-10 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold focus:ring-2 focus:ring-[var(--golf-gold)]"
          />
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--golf-gold)]" />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--golf-dark)]/60 hover:text-[var(--golf-dark)]"
            >
              <FaTimes />
            </button>
          )}
          {loading && (
            <FaSpinner className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--golf-gold)] animate-spin" />
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 font-semibold text-sm">
          {error}
        </div>
      )}

      {/* Search Results */}
      {showResults && (
        <div className="glass rounded-xl border border-[var(--golf-gold)]/30 max-h-96 overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-4 text-center text-[var(--golf-dark)]/60">
              검색 결과가 없습니다.
            </div>
          ) : (
            <div className="p-2">
              <div className="text-xs text-[var(--golf-dark)]/60 mb-2 px-2">
                {results.length}개의 결과 발견
              </div>
              {results.map((user) => (
                <button
                  key={user.documentId}
                  onClick={() => handleUserSelect(user)}
                  className="w-full text-left p-3 rounded-lg hover:bg-[var(--golf-gold)]/10 transition-colors border border-transparent hover:border-[var(--golf-gold)]/20"
                >
                  <div className="flex items-center gap-3">
                    <FaUser className="text-[var(--golf-green)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-[var(--golf-dark)]">
                          {user.user_id || '사용자 ID 없음'}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          user.matchType === 'exact' 
                            ? 'bg-green-500/20 text-green-700' 
                            : 'bg-blue-500/20 text-blue-700'
                        }`}>
                          {user.matchType === 'exact' ? '정확 일치' : '부분 일치'}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--golf-dark)]/70">
                        <div className="mb-1">
                          매칭 필드: <span className="font-medium text-[var(--golf-green)]">{user.matchField}</span>
                          {user.matchField === 'user_id' && user.user_id && (
                            <span className="ml-2 font-mono">"{user.user_id}"</span>
                          )}
                          {user.matchField === 'auth_email' && user.auth_email && (
                            <span className="ml-2 font-mono">"{user.auth_email}"</span>
                          )}
                          {user.matchField === 'address' && user.address && (
                            <span className="ml-2 font-mono text-xs">"{formatFieldValue(user.address, 'address')}"</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          {user.auth_email && user.matchField !== 'auth_email' && (
                            <div>이메일: <span className="font-medium">{user.auth_email}</span></div>
                          )}
                          {user.address && user.matchField !== 'address' && (
                            <div>주소: <span className="font-mono text-xs">{formatFieldValue(user.address, 'address')}</span></div>
                          )}
                          {user.created_at && (
                            <div>생성일: <span className="font-medium">{formatFieldValue(user.created_at, 'created_at')}</span></div>
                          )}
                          {user.migratedAt && (
                            <div>마이그레이션: <span className="font-medium">{formatFieldValue(user.migratedAt, 'migratedAt')}</span></div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 