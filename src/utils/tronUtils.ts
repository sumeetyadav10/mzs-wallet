// utils/tronUtils.ts - Tron utility functions for all wallets

export interface TronWallet {
  address: string;
  energyDelegated: boolean;
  resources?: {
    energy: number;
    bandwidth: number;
  };
}

export interface TronBalance {
  trxBalance: number;
  tokens: Array<{
    symbol: string;
    name: string;
    address: string;
    balance: number;
    decimals: number;
    logo?: string;
  }>;
  resources: {
    energy: number;
    bandwidth: number;
  };
  trxPrice: number;
}

// Get or create Tron wallet from email
export async function getTronWallet(email: string): Promise<TronWallet> {
  try {
    const response = await fetch('/api/tron/wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to get Tron wallet');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting Tron wallet:', error);
    throw error;
  }
}

// Get Tron balance
export async function getTronBalance(address: string): Promise<TronBalance> {
  try {
    const response = await fetch('/api/tron/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to get Tron balance');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting Tron balance:', error);
    throw error;
  }
}

// Send Tron transaction (always gasless)
export async function sendTronTransaction(
  privateKey: string,
  toAddress: string,
  amount: number,
  token: string = 'TRX'
): Promise<any> {
  try {
    // Encrypt private key
    const encryptedKey = btoa(encodeURIComponent(privateKey));
    
    const response = await fetch('/api/tron/gasless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encryptedPrivateKey: encryptedKey,
        toAddress,
        amount,
        token,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Transaction failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending Tron transaction:', error);
    throw error;
  }
}

// Validate Tron address
export function isValidTronAddress(address: string): boolean {
  return address.startsWith('T') && address.length === 34;
}

// Format TRX amount
export function formatTrxAmount(amount: number): string {
  if (amount === 0) return '0 TRX';
  if (amount < 0.000001) return '<0.000001 TRX';
  if (amount < 1) return `${amount.toFixed(6)} TRX`;
  if (amount < 1000) return `${amount.toFixed(2)} TRX`;
  return `${amount.toFixed(0)} TRX`;
}

// Get Tron transaction explorer URL
export function getTronExplorerUrl(txid: string): string {
  return `https://tronscan.org/#/transaction/${txid}`;
}

// Popular TRC-20 tokens
export const TRON_TOKENS = {
  TRX: {
    symbol: 'TRX',
    name: 'Tron',
    address: 'native',
    decimals: 6,
    logo: '/tron-logo.svg',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    logo: '',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    decimals: 6,
    logo: '',
  },
};