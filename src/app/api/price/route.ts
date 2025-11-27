import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const coin = searchParams.get('coin');
  const token = searchParams.get('token'); // Support for token parameter (ROAM)
  
  if (!coin && !token) {
    return NextResponse.json({ error: 'Coin or token parameter required' }, { status: 400 });
  }
  
  // Handle ROAM token specifically
  if (token === 'ROAM') {
    try {
      // ROAM is not on CoinGecko, so we need to use a different source
      // For now, return a static price or fetch from Jupiter/Birdeye
      logger.log('Fetching ROAM price');
      
      // Option 1: Static price for now
      return NextResponse.json({ price: 0.001 }); // $0.001 per ROAM
      
      // Option 2: Fetch from Jupiter Price API (uncomment to use)
      /*
      const jupiterResponse = await fetch(
        'https://price.jup.ag/v4/price?ids=RoamA1USA8xjvpTJZ6RvvxyDRzNh6GCA1zVGKSiMVkn',
        { next: { revalidate: 60 } }
      );
      if (jupiterResponse.ok) {
        const jupiterData = await jupiterResponse.json();
        const roamData = jupiterData.data['RoamA1USA8xjvpTJZ6RvvxyDRzNh6GCA1zVGKSiMVkn'];
        return NextResponse.json({ price: roamData?.price || 0.001 });
      }
      */
    } catch (error) {
      logger.error('ROAM price fetch error:', error);
      return NextResponse.json({ price: 0.001 }); // Fallback price
    }
  }
  
  // Handle other coins via CoinGecko
  try {
    const coinId = coin || token?.toLowerCase();
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
        // Add cache to reduce API calls
        next: { revalidate: 60 } // Cache for 60 seconds
      }
    );
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    logger.error('Price fetch error:', error);
    
    // Check for timeout/network errors
    if (error.name === 'AbortError' || error.message?.includes('fetch failed')) {
      logger.warn('Price API timeout, using fallback prices');
    }
    
    // Return cached/default prices if API fails
    const defaultPrices: Record<string, any> = {
      'solana': { usd: 100 },
      'matic-network': { usd: 1 },
      'tron': { usd: 0.08 },
    };
    
    return NextResponse.json(defaultPrices[coin || ''] || { usd: 0 });
  }
}