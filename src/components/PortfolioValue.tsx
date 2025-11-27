import React, { useEffect, useState } from 'react';
import { getLatestMZSPrice, getMZSPriceHistory } from '@/lib/api/mzsPrice';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface PortfolioValueProps {
  mzsBalance: number;
  compact?: boolean;
}

export default function PortfolioValue({ mzsBalance, compact = false }: PortfolioValueProps) {
  const [price, setPrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<Array<[number, number]>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); // Reset loading state when mzsBalance changes
    const fetchData = async () => {
      try {
        const [latestPrice, history] = await Promise.all([
          getLatestMZSPrice(),
          getMZSPriceHistory()
        ]);
        setPrice(latestPrice);
        setPriceHistory(history);
        setError(null);
      } catch (err: any) {
        // More specific error messaging based on error type
        if (err?.response?.status === 503) {
          setError('Price service temporarily unavailable - using cached data');
        } else if (err?.code === 'ECONNABORTED') {
          setError('Price service timeout - using cached data');
        } else {
          setError('Unable to fetch live prices - using cached data');
        }
        console.warn('Price fetch error (using fallback):', err);
        
        // Even on error, try to get fallback price to show something useful
        try {
          const fallbackPrice = await getLatestMZSPrice(); // This returns fallback on error
          setPrice(fallbackPrice);
        } catch {
          setPrice(0.0053); // Final fallback
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [mzsBalance]);

  const portfolioValue = price ? mzsBalance * price : 0;

  if (loading) {
    return compact ? (
      <div className="animate-pulse-slow">Loading...</div>
    ) : (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error && !price) {
    return compact ? (
      <div className="text-yellow-600">{error}</div>
    ) : (
      <div className="p-4 bg-yellow-50 rounded-lg shadow-md">
        <p className="text-yellow-700">{error}</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col items-center">
        <div className="text-4xl font-bold text-[var(--golf-green)]">
          ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
        </div>
        <div className="text-sm text-[var(--golf-dark)]">
          {mzsBalance.toLocaleString()} MZS
        </div>
      </div>
    );
  }

  const chartData = {
    labels: priceHistory.map(([timestamp]) => new Date(timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'MZS Price (USDT)',
        data: priceHistory.map(([, price]) => price),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-white rounded-lg shadow-md"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Portfolio Value</h2>
        {error && (
          <div className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
            Using cached data
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="mb-4">
            <p className="text-gray-600">MZS Balance</p>
            <p className="text-2xl font-semibold">{mzsBalance.toLocaleString()} MZS</p>
          </div>
          
          <div className="mb-4">
            <p className="text-gray-600">Current Price</p>
            <p className="text-2xl font-semibold">${price?.toFixed(4)} USDT</p>
          </div>
          
          <div>
            <p className="text-gray-600">Total Value</p>
            <p className="text-3xl font-bold">${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</p>
          </div>
        </div>
        
        <div className="h-64">
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                y: {
                  beginAtZero: false,
                },
              },
            }}
          />
        </div>
      </div>
    </motion.div>
  );
} 