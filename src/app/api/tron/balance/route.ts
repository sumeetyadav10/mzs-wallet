import { NextRequest, NextResponse } from 'next/server';
import { SecureTronService } from '@/lib/tron-server';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const { address, customTokens } = await req.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }
    
    logger.log('[Tron Balance API] Fetching balance for:', address);
    logger.log('[Tron Balance API] Custom tokens:', customTokens);
    
    const balance = await SecureTronService.getBalance(address, customTokens);
    
    // Get current TRX price
    let trxPrice = 0.13; // Default price
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd');
      const priceData = await priceResponse.json();
      trxPrice = priceData.tron?.usd || 0.13;
    } catch (e) {
      logger.warn('[Tron Balance API] Failed to fetch TRX price, using default');
    }
    
    // Add price information
    const enrichedBalance = {
      ...balance,
      trxPrice,
      trxValueUSD: balance.trxBalance * trxPrice,
      tokens: balance.tokens.map((token: any) => ({
        ...token,
        price: token.symbol === 'USDT' || token.symbol === 'USDC' ? 1 : 0,
        valueUSD: token.symbol === 'USDT' || token.symbol === 'USDC' ? token.balance : 0,
      })),
    };
    
    return NextResponse.json(enrichedBalance);
    
  } catch (error) {
    logger.error('[Tron Balance API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch balance',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// GET endpoint for convenience
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const address = searchParams.get('address');
  
  if (!address) {
    return NextResponse.json({ error: 'Address parameter required' }, { status: 400 });
  }
  
  // Reuse POST logic
  return POST(new NextRequest(req.url, {
    method: 'POST',
    body: JSON.stringify({ address }),
  }));
}