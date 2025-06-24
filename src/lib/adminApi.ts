import { auth } from './firebase';

export class AdminApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export async function adminRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  try {
    // Get current user's auth token
    const user = auth.currentUser;
    if (!user) {
      throw new AdminApiError('인증되지 않은 사용자입니다.', 401);
    }

    const token = await user.getIdToken();
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
  searchUsers: (query: string, field?: string) =>
    adminRequest('/api/admin/search-users', {
      method: 'POST',
      body: JSON.stringify({ query, field }),
    }),

  // Get user details
  getUserDetails: (documentId: string) =>
    adminRequest(`/api/admin/user-management?documentId=${documentId}`),

  // Update user
  updateUser: (documentId: string, updates: Record<string, any>, adminNote?: string) =>
    adminRequest('/api/admin/user-management', {
      method: 'PUT',
      body: JSON.stringify({ documentId, updates, adminNote }),
    }),

  // Delete user or fields
  deleteUser: (documentId: string, fieldsToDelete?: string[], confirmationCode?: string) =>
    adminRequest('/api/admin/user-management', {
      method: 'DELETE',
      body: JSON.stringify({ documentId, fieldsToDelete, confirmationCode }),
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