'use client';

import { useState, useEffect } from 'react';
import { FaTimes, FaEdit, FaTrash, FaSave, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import { adminApi, AdminApiError } from '@/lib/adminApi';


interface UserData {
  documentId: string;
  user_id?: string;
  auth_email?: string;
  address?: string;
  created_at?: string;
  migratedAt?: string;
  migrated?: boolean;
  [key: string]: any;
}

interface UserManagerProps {
  user: UserData | null;
  onClose: () => void;
  onUserUpdated: () => void;
}

const EDITABLE_FIELDS = [
  { key: 'user_id', label: '사용자 ID', type: 'text' },
  { key: 'auth_email', label: '인증 이메일', type: 'email' },
  { key: 'address', label: '지갑 주소', type: 'text' },
  { key: 'created_at', label: '생성일', type: 'datetime-local' },
  { key: 'migratedAt', label: '마이그레이션일', type: 'datetime-local' },
  { key: 'migrated', label: '마이그레이션 상태', type: 'boolean' }
];

const SENSITIVE_FIELDS = ['private_key', 'password_hash', 'mnemonic', 'seed'];

export default function UserManager({ user, onClose, onUserUpdated }: UserManagerProps) {
  const [editingFields, setEditingFields] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState('');
  const [deleteMode, setDeleteMode] = useState<'user' | 'fields'>('user');
  const [fieldsToDelete, setFieldsToDelete] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      // Initialize editing fields with current values
      const initialFields: Record<string, any> = {};
      EDITABLE_FIELDS.forEach(field => {
        if (user[field.key] !== undefined) {
          if (field.type === 'datetime-local' && user[field.key]) {
            try {
              const date = new Date(user[field.key]);
              initialFields[field.key] = date.toISOString().slice(0, 16);
            } catch {
              initialFields[field.key] = user[field.key];
            }
          } else {
            initialFields[field.key] = user[field.key];
          }
        }
      });
      setEditingFields(initialFields);
    }
  }, [user]);

  const handleFieldChange = (fieldKey: string, value: any) => {
    setEditingFields(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  const handleSaveField = async (fieldKey: string) => {
    if (!user) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const value = editingFields[fieldKey];
      const updates: Record<string, any> = {};
      
      // Handle datetime conversion
      const field = EDITABLE_FIELDS.find(f => f.key === fieldKey);
      if (field?.type === 'datetime-local' && value) {
        updates[fieldKey] = new Date(value).toISOString();
      } else {
        updates[fieldKey] = value;
      }

      // Call the admin API to update the user
      await adminApi.updateUser(user.documentId, updates, `Updated field: ${fieldKey}`);
      
      setSuccess(`${field?.label || fieldKey} 필드가 성공적으로 업데이트되었습니다.`);
      onUserUpdated(); // Refresh the data
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError('필드 업데이트 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFields = async () => {
    if (!user || fieldsToDelete.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Call the admin API to delete specific fields
      await adminApi.deleteUser(user.documentId, fieldsToDelete, deleteConfirmCode);
      
      setSuccess(`${fieldsToDelete.length}개의 필드가 성공적으로 삭제되었습니다.`);
      setShowDeleteConfirm(false);
      setDeleteConfirmCode('');
      setFieldsToDelete([]);
      onUserUpdated(); // Refresh the data
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError('필드 삭제 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Call the admin API to delete the entire user
      await adminApi.deleteUser(user.documentId, undefined, deleteConfirmCode);
      
      setSuccess('사용자가 성공적으로 삭제되었습니다.');
      setShowDeleteConfirm(false);
      setDeleteConfirmCode('');
      onUserUpdated(); // Refresh the data
      onClose(); // Close the modal after successful deletion
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError('사용자 삭제 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatFieldValue = (value: any, fieldType: string): string => {
    if (value === null || value === undefined) return '없음';
    
    if (fieldType === 'boolean') {
      return value ? '예' : '아니오';
    }
    
    if (fieldType === 'datetime-local') {
      try {
        return new Date(value).toLocaleString('ko-KR');
      } catch {
        return String(value);
      }
    }
    
    return String(value);
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--golf-gold)]/30 animate-float">
        {/* Header */}
        <div className="sticky top-0 glass p-6 border-b border-[var(--golf-gold)]/20 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--golf-green)]">
            사용자 관리: {user.user_id || '사용자 ID 없음'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--golf-gold)]/20 transition-colors"
          >
            <FaTimes className="text-[var(--golf-dark)]" size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 font-semibold">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-700 font-semibold">
              {success}
            </div>
          )}

          {/* Editable Fields */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-[var(--golf-green)] mb-4">편집 가능한 필드</h3>
            <div className="space-y-4">
              {EDITABLE_FIELDS.map(field => (
                <div key={field.key} className="glass p-4 rounded-xl border border-[var(--golf-gold)]/20">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-semibold text-[var(--golf-dark)]">{field.label}</label>
                    <button
                      onClick={() => handleSaveField(field.key)}
                      disabled={loading}
                      className="glass px-3 py-1 rounded-lg border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-medium hover:bg-[var(--golf-gold)]/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {loading ? <FaSpinner className="animate-spin" /> : <FaSave />}
                      저장
                    </button>
                  </div>
                  
                  {field.type === 'boolean' ? (
                    <select
                      value={editingFields[field.key] ? 'true' : 'false'}
                      onChange={(e) => handleFieldChange(field.key, e.target.value === 'true')}
                      className="glass w-full px-3 py-2 rounded-lg border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-medium focus:ring-2 focus:ring-[var(--golf-gold)]"
                    >
                      <option value="true">예</option>
                      <option value="false">아니오</option>
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={editingFields[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className="glass w-full px-3 py-2 rounded-lg border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-medium focus:ring-2 focus:ring-[var(--golf-gold)]"
                      placeholder={`${field.label} 입력...`}
                    />
                  )}
                  
                  <div className="mt-2 text-sm text-[var(--golf-dark)]/60">
                    현재 값: {formatFieldValue(user[field.key], field.type)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Read-only Fields */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-[var(--golf-green)] mb-4">읽기 전용 필드</h3>
            <div className="space-y-3">
              {Object.entries(user)
                .filter(([key]) => !EDITABLE_FIELDS.some(f => f.key === key) && key !== 'documentId')
                .map(([key, value]) => (
                  <div key={key} className="glass p-3 rounded-xl border border-[var(--golf-gold)]/20">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-[var(--golf-dark)] capitalize">{key}</span>
                      {SENSITIVE_FIELDS.includes(key) ? (
                        <span className="text-red-500 font-semibold">민감한 데이터</span>
                      ) : (
                        <span className="text-[var(--golf-dark)]/70 text-sm break-all">
                          {value ? String(value) : '없음'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="border-t border-red-500/20 pt-6">
            <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
              <FaExclamationTriangle />
              위험 구역
            </h3>
            
            <div className="space-y-4">
              <button
                onClick={() => {
                  setDeleteMode('fields');
                  setShowDeleteConfirm(true);
                }}
                className="glass px-4 py-2 rounded-xl border border-yellow-500/30 text-yellow-700 font-semibold hover:bg-yellow-500/10 transition-colors flex items-center gap-2"
              >
                <FaEdit />
                필드 삭제
              </button>
              
              <button
                onClick={() => {
                  setDeleteMode('user');
                  setShowDeleteConfirm(true);
                }}
                className="glass px-4 py-2 rounded-xl border border-red-500/30 text-red-600 font-semibold hover:bg-red-500/10 transition-colors flex items-center gap-2"
              >
                <FaTrash />
                사용자 삭제
              </button>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="glass p-6 rounded-2xl max-w-md w-full mx-4 border border-red-500/30">
              <h3 className="text-xl font-bold text-red-600 mb-4">
                {deleteMode === 'user' ? '사용자 삭제 확인' : '필드 삭제 확인'}
              </h3>
              
              {deleteMode === 'fields' && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[var(--golf-dark)] mb-2">
                    삭제할 필드 선택:
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {Object.keys(user).filter(key => key !== 'documentId').map(key => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={fieldsToDelete.includes(key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFieldsToDelete(prev => [...prev, key]);
                            } else {
                              setFieldsToDelete(prev => prev.filter(f => f !== key));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-[var(--golf-dark)]">{key}</span>
                        {SENSITIVE_FIELDS.includes(key) && (
                          <span className="text-red-500 text-xs">민감</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-sm font-semibold text-[var(--golf-dark)] mb-2">
                  확인 코드 입력: <code className="text-red-600">DELETE_CONFIRMED</code>
                </label>
                <input
                  type="text"
                  value={deleteConfirmCode}
                  onChange={(e) => setDeleteConfirmCode(e.target.value)}
                  className="glass w-full px-3 py-2 rounded-lg border border-red-500/30 text-[var(--golf-dark)] font-medium focus:ring-2 focus:ring-red-500"
                  placeholder="DELETE_CONFIRMED"
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmCode('');
                    setFieldsToDelete([]);
                  }}
                  className="flex-1 glass px-4 py-2 rounded-xl border border-[var(--golf-gold)]/30 text-[var(--golf-dark)] font-semibold hover:bg-[var(--golf-gold)]/10 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={deleteMode === 'user' ? handleDeleteUser : handleDeleteFields}
                  disabled={deleteConfirmCode !== 'DELETE_CONFIRMED' || loading || (deleteMode === 'fields' && fieldsToDelete.length === 0)}
                  className="flex-1 glass px-4 py-2 rounded-xl border border-red-500/30 text-red-600 font-semibold hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <FaSpinner className="animate-spin" /> : <FaTrash />}
                  {deleteMode === 'user' ? '사용자 삭제' : '필드 삭제'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 