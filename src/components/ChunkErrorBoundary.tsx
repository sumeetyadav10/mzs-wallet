'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's a chunk loading error
    const isChunkError = error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module');
    
    if (isChunkError) {
      console.error('Chunk loading error detected:', error);
    }
    
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Check if it's a chunk error
    if (this.isChunkError(error)) {
      // Auto-reload after a delay
      setTimeout(() => {
        console.log('Reloading page due to chunk error...');
        window.location.reload();
      }, 1500);
    }
  }

  isChunkError(error: Error): boolean {
    return error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('insertBefore');
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error && this.isChunkError(this.state.error);
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {isChunkError ? '페이지를 새로고침하는 중...' : '오류가 발생했습니다'}
            </h2>
            <p className="text-gray-600 mb-6">
              {isChunkError 
                ? '애플리케이션이 업데이트되었습니다. 잠시 후 자동으로 새로고침됩니다.'
                : '일시적인 오류가 발생했습니다. 다시 시도해 주세요.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                지금 새로고침
              </button>
              {!isChunkError && (
                <button
                  onClick={this.handleReset}
                  className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition"
                >
                  다시 시도
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;