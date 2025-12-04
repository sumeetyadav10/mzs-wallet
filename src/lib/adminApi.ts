import { auth } from './firebase';

export class AdminApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

// Device fingerprinting function with graceful fallbacks
let cachedFingerprint: string | null = null;

const generateDeviceFingerprint = (): string => {
  // Return cached fingerprint if available
  if (cachedFingerprint) {
    return cachedFingerprint;
  }
  
  // Only run on client side to avoid hydration issues
  if (typeof window === 'undefined') {
    return 'server-render-placeholder';
  }
  
  const components: string[] = [];
  
  // 1. User agent and language (always available)
  components.push(navigator.userAgent || 'unknown-ua');
  components.push(navigator.language || 'en');
  
  // 2. Screen properties with fallback
  try {
    components.push(`${screen.width || 0}x${screen.height || 0}`);
    components.push(`${screen.colorDepth || 0}`);
  } catch {
    components.push('0x0');
    components.push('0');
  }
  
  // 3. Timezone
  try {
    components.push(String(new Date().getTimezoneOffset()));
  } catch {
    components.push('0');
  }
  
  // 4. Canvas fingerprint with graceful fallback
  let canvasData = 'canvas-blocked';
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Test if canvas is actually writable
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.font = '11pt Arial';
      ctx.fillText('MZS Admin', 2, 15);
      
      // Try to get data URL
      try {
        canvasData = canvas.toDataURL().slice(-50);
      } catch (e) {
        // Canvas.toDataURL blocked by privacy settings
        canvasData = 'canvas-read-blocked';
      }
    }
  } catch (e) {
    // Canvas API completely blocked
    canvasData = 'canvas-api-blocked';
  }
  components.push(canvasData);
  
  // 5. Additional entropy from available APIs
  const entropy: string[] = [];
  
  // Hardware concurrency
  if (navigator.hardwareConcurrency) {
    entropy.push(`hw:${navigator.hardwareConcurrency}`);
  }
  
  // Device memory (if available)
  if ('deviceMemory' in navigator) {
    entropy.push(`mem:${(navigator as any).deviceMemory}`);
  }
  
  // Platform
  if (navigator.platform) {
    entropy.push(`plat:${navigator.platform}`);
  }
  
  // Combine all components
  const rawFingerprint = components.join('|') + '|' + entropy.join(',');
  
  // Create hash using available methods
  try {
    // Use subtle crypto if available
    if (window.crypto && window.crypto.subtle) {
      // For now, use simple base64 encoding
      // In production, you'd want to use crypto.subtle.digest
      cachedFingerprint = btoa(rawFingerprint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
      return cachedFingerprint;
    }
  } catch {
    // Fallback to simple encoding
  }
  
  // Final fallback: simple base64 encoding
  try {
    cachedFingerprint = btoa(rawFingerprint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    return cachedFingerprint;
  } catch {
    // Even btoa failed, use a simple hash
    let hash = 0;
    for (let i = 0; i < rawFingerprint.length; i++) {
      const char = rawFingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    cachedFingerprint = 'fallback-' + Math.abs(hash).toString(36).padEnd(41, '0').slice(0, 41);
    return cachedFingerprint;
  }
};

export async function adminRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  try {
    // First check for admin session token (from MFA auth)
    const sessionToken = localStorage.getItem('admin_session_token');
    
    if (!sessionToken) {
      // If no session token, check if user is authenticated with Firebase
      const user = auth.currentUser;
      if (!user) {
        throw new AdminApiError('인증되지 않은 사용자입니다. 관리자 패널에 다시 로그인하세요.', 401);
      }
      throw new AdminApiError('관리자 세션이 만료되었습니다. MFA 인증을 다시 진행해주세요.', 401);
    }

    // Generate device fingerprint for every request
    let deviceFingerprint = 'generation-failed';
    try {
      deviceFingerprint = generateDeviceFingerprint();
    } catch (error) {
      console.error('Failed to generate device fingerprint in adminRequest:', error);
      // Use a basic fallback that includes some request context
      const fallbackComponents = [
        'admin-api',
        endpoint.split('/').pop() || 'unknown',
        Date.now().toString(36)
      ];
      deviceFingerprint = 'api-fallback-' + fallbackComponents.join('-');
    }
    
    console.log('[AdminAPI] Making request to:', endpoint, 'with fingerprint:', deviceFingerprint.substring(0, 10) + '...');
    
    // Prepare headers with session token and device fingerprint
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
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
        localStorage.removeItem('admin_session_token');
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
  getUserDetails: (docId: string) =>
    adminRequest(`/api/admin/user-management?docId=${docId}`),

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