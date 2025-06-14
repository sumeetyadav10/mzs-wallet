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
      } catch (err) {
        setError('Failed to fetch price data');
        console.error(err);
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

  if (error) {
    return compact ? (
      <div className="text-[var(--korean-red)]">{error}</div>
    ) : (
      <div className="p-4 bg-red-50 rounded-lg shadow-md">
        <p className="text-red-600">{error}</p>
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
      <h2 className="text-2xl font-bold mb-4">Portfolio Value</h2>
      
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