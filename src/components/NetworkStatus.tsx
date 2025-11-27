import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

interface NetworkStatusProps {
  chain: 'polygon' | 'tron';
}

export default function NetworkStatus({ chain }: NetworkStatusProps) {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'error'>('connecting');
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [tps, setTps] = useState<number | null>(null);

  useEffect(() => {
    if (chain === 'polygon') {
      // For Polygon, we just check if we can connect
      checkPolygonStatus();
    } else if (chain === 'tron') {
      // DISABLED: For Tron, we check connection to prevent rate limits
      // checkTronStatus();
      // const interval = setInterval(checkTronStatus, 30000); // Update every 30 seconds instead of 10
      // return () => clearInterval(interval);
      setStatus('connected'); // Show as connected without API calls
    }
  }, [chain]);

  const checkPolygonStatus = async () => {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_POLYGON_RPC_URL || '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: []
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          setStatus('connected');
          setBlockHeight(parseInt(data.result, 16));
        }
      } else {
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
    }
  };


  const checkTronStatus = async () => {
    try {
      // Add small delay to avoid simultaneous API calls
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
      
      const response = await fetch('https://api.trongrid.io/wallet/getnowblock', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.block_header) {
          setStatus('connected');
          setBlockHeight(data.block_header.raw_data.number);
        }
      } else if (response.status === 429) {
        // Rate limit hit - keep current status, don't change to error
        return;
      } else {
        setStatus('error');
      }
    } catch (error) {
      logger.error('Tron status check failed:', error);
      setStatus('error');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        );
      case 'connecting':
        return (
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
        );
      case 'error':
        return (
          <div className="w-2 h-2 bg-red-500 rounded-full" />
        );
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return '연결됨';
      case 'connecting':
        return '연결 중...';
      case 'error':
        return '연결 오류';
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      {getStatusIcon()}
      <span>{chain === 'polygon' ? 'Polygon' : 'Tron'}</span>
      <span className="text-gray-500">•</span>
      <span>{getStatusText()}</span>
      {status === 'connected' && blockHeight && (
        <>
          <span className="text-gray-500">•</span>
          <span>#{blockHeight.toLocaleString()}</span>
        </>
      )}
    </div>
  );
}