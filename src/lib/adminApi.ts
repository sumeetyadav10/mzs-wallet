import { auth } from './firebase';

export class AdminApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

// Generate device fingerprint for security
function generateDeviceFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Device fingerprint test', 2, 2);
    }
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform || 'unknown',
      screenResolution: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      plugins: navigator.plugins.length,
      canvas: canvas.toDataURL().substring(0, 100)
    };
    
    // Create a hash from the fingerprint data
    const fpString = JSON.stringify(fingerprint);
    let hash = 0;
    for (let i = 0; i < fpString.length; i++) {
      const char = fpString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `fp_${Math.abs(hash).toString(16).padStart(8, '0')}`;
  } catch (error) {
    // Fallback if fingerprinting fails
    return `fp_fallback_${Date.now().toString(16)}`;
  }
}

export async function adminRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  try {
    // First check for admin session token (from MFA auth)
    const sessionToken = localStorage.getItem('adminSessionToken');
    
    if (!sessionToken) {
      // If no session token, check if user is authenticated with Firebase
      const user = auth.currentUser;
      if (!user) {
        throw new AdminApiError('인증되지 않은 사용자입니다. 관리자 패널에 다시 로그인하세요.', 401);
      }
      throw new AdminApiError('관리자 세션이 만료되었습니다. MFA 인증을 다시 진행해주세요.', 401);
    }

    // Generate unique device fingerprint
    const deviceFingerprint = generateDeviceFingerprint();
    
    console.log('[AdminAPI] Making request to:', endpoint);
    
    // Prepare headers with session token and device fingerprint
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-session': sessionToken,
      'x-device-fingerprint': deviceFingerprint,
      ...options.headers,
    };

    // Make the request
    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    // Handle response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // If session is invalid, clear it and prompt re-login
      if (response.status === 403 || response.status === 401) {
        localStorage.removeItem('adminSessionToken');
        window.location.href = '/admin/login';
      }
      
      throw new AdminApiError(
        errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AdminApiError) {
      throw error;
    }
    throw new AdminApiError(
      error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
    );
  }
}

// Helper functions for common admin operations
export const adminApi = {
  // Search users
  searchUsers: (searchTerm: string, field?: string) =>
    adminRequest('/api/admin/search-users', {
      method: 'POST',
      body: JSON.stringify({ 
        searchTerm, 
        searchFields: field ? [field] : undefined 
      }),
    }),

  // Get user details
  getUserDetails: (userId: string) =>
    adminRequest(`/api/admin/user-details?userId=${userId}`),

  // Update user
  updateUser: (docId: string, updates: Record<string, any>, adminAction?: string) =>
    adminRequest('/api/admin/user-management', {
      method: 'PUT',
      body: JSON.stringify({ docId, updates, adminAction }),
    }),

  // Delete user or fields
  deleteUser: (docId: string, fieldsToDelete?: string[], deleteEntireDoc?: boolean, confirmationCode?: string) =>
    adminRequest('/api/admin/user-management', {
      method: 'DELETE',
      body: JSON.stringify({ docId, fieldsToDelete, deleteEntireDoc, confirmationCode }),
    }),

  // Get analytics
  getAnalytics: () =>
    adminRequest('/api/admin/analytics'),

  // Recovery requests (existing functionality)
  getRecoveryRequests: () =>
    adminRequest('/api/admin/recovery-requests'),

  approveRecovery: (requestId: string) =>
    adminRequest('/api/admin/approve-recovery', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    }),

  rejectRecovery: (requestId: string) =>
    adminRequest('/api/admin/reject-recovery', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    }),
};