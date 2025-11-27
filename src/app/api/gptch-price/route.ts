import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = 'https://api-cloud.bitmart.com/spot/v1/ticker?symbol=GPTCH_USDT';
    
    // Add timeout and retry logic
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const res = await fetch(url, { 
        headers: { 'accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      return NextResponse.json(data, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      
      // Return fallback data on error
      return NextResponse.json({
        code: 1000,
        message: "Price temporarily unavailable",
        data: {
          symbol: "GPTCH_USDT",
          last_price: "0.0",
          quote_volume_24h: "0.0",
          base_volume_24h: "0.0",
          high_24h: "0.0",
          low_24h: "0.0",
          open_24h: "0.0",
          close_24h: "0.0",
          timestamp: Date.now()
        }
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch price data' },
      { status: 500 }
    );
  }
} 