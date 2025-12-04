// Utility to handle chunk loading retries
const RETRY_DELAY = 1000;
const MAX_RETRIES = 3;

// Keep track of retries
const retryCount = new Map<string, number>();

// Extend window interface for webpack
declare global {
  interface Window {
    __webpack_require__?: {
      e: (chunkId: string) => Promise<any>;
    };
  }
}

// Original dynamic import function
const originalImport = window.__webpack_require__?.e;

if (originalImport && window.__webpack_require__) {
  // Override webpack's chunk loading
  window.__webpack_require__.e = function (chunkId: string): Promise<any> {
    let retries = retryCount.get(chunkId) || 0;

    const load = (): Promise<any> => {
      return originalImport.call(this, chunkId).catch((error: Error) => {
        if (retries < MAX_RETRIES) {
          retries++;
          retryCount.set(chunkId, retries);
          
          console.warn(
            `Chunk ${chunkId} failed to load, retrying... (${retries}/${MAX_RETRIES})`,
            error
          );

          // Wait before retrying
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(load());
            }, RETRY_DELAY * retries);
          });
        }

        // Max retries reached
        console.error(`Failed to load chunk ${chunkId} after ${MAX_RETRIES} retries`);
        
        // Clear retry count
        retryCount.delete(chunkId);
        
        // Check if it's a navigation chunk
        if (error.message?.includes('Loading chunk')) {
          // For navigation chunks, reload the page
          console.log('Navigation chunk failed, reloading page...');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
        
        throw error;
      });
    };

    return load();
  };
}

// Handle router errors
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    
    if (error?.name === 'ChunkLoadError' || 
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Failed to fetch dynamically imported module')) {
      
      console.error('Unhandled chunk loading error:', error);
      
      // Prevent the default error handling
      event.preventDefault();
      
      // Show user-friendly message
      const message = document.createElement('div');
      message.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #f59e0b;
          color: white;
          padding: 16px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          z-index: 9999;
          max-width: 300px;
        ">
          <strong>페이지 업데이트 중...</strong><br>
          <small>잠시 후 자동으로 새로고침됩니다.</small>
        </div>
      `;
      document.body.appendChild(message);
      
      // Auto reload after showing message
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  });
}

// Export a function to manually retry failed imports
export const retryImport = (fn: () => Promise<any>, retriesLeft = 3): Promise<any> => {
  return fn().catch((error) => {
    if (retriesLeft > 0 && error.name === 'ChunkLoadError') {
      console.warn(`Retrying import, ${retriesLeft} attempts left`);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(retryImport(fn, retriesLeft - 1));
        }, RETRY_DELAY);
      });
    }
    throw error;
  });
};

// Utility to wrap dynamic imports
export const safeDynamicImport = <T = any>(
  importFn: () => Promise<{ default: T }>
): Promise<{ default: T }> => {
  return retryImport(importFn);
};