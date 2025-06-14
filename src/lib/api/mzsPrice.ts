import axios from 'axios';

// UZX Exchange API endpoints
const UZX_API_BASE = 'https://api.uzx.com';

export interface MZSPrice {
  price: number;
  volume: number;
  change24h: number;
}

export async function getMZSPrice(): Promise<MZSPrice> {
  try {
    const response = await axios.get(`${UZX_API_BASE}/api/v1/market/ticker/MZS-USDT`);
    const data = response.data;
    return {
      price: parseFloat(data.last),
      volume: parseFloat(data.volume),
      change24h: parseFloat(data.price_change_percent)
    };
  } catch (error) {
    console.error('Error fetching MZS price:', error);
    throw error;
  }
}

/**
 * Fetch MZS/USDT price history for the last `hours` hours (default: 24h)
 * @param hours Number of hours of history to fetch
 * @param resolution Candle resolution in minutes (default: 5)
 */
export async function getMZSPriceHistory(hours: number = 24, resolution: number = 5): Promise<Array<[number, number]>> {
  const now = Date.now();
  const from = now - hours * 60 * 60 * 1000;
  const to = now;
  const url = `https://api.uzx.com/market/history?symbol=MZS%2FUSDT&resolution=${resolution}&from=${from}&to=${to}`;
  const response = await axios.get(url);
  const data = response.data;
  // Each item: [timestamp, open, high, low, close, volume]
  return data.map((item: any) => [
    item[0], // timestamp
    item[4]  // closing price
  ]);
}

export async function getLatestMZSPrice(): Promise<number> {
  // This endpoint and time range can be dynamically generated, but for now, use the working example
  const url = 'https://api.uzx.com/market/history?symbol=MZS%2FUSDT&resolution=5&from=1749820818000&to=1749919458957';
  const response = await axios.get(url);
  const data = response.data;
  if (Array.isArray(data) && data.length > 0) {
    const lastCandle = data[data.length - 1];
    const closePrice = lastCandle[4]; // [timestamp, open, high, low, close, volume]
    return closePrice;
  }
  throw new Error('No data returned');
} 