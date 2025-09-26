import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const action = searchParams.get('action'); // 'txlist' or 'tokentx'

    if (!address || !action) {
      return NextResponse.json({ error: 'Address and action are required' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_POLYGONSCAN_API_KEY || 'MG6RJ6UYNEV5MWH9BABFHCYIJNGUNX248E';
    const apiUrl = `https://api.etherscan.io/v2/api?chainid=137&module=account&action=${action}&address=${address}&sort=desc&apikey=${apiKey}`;

    console.log(`[Transactions API] Fetching ${action} for address ${address}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`[Transactions API] HTTP error! status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Log API response status for debugging
    if (data.status !== "1") {
      console.error(`[Transactions API] API Error for ${action}:`, data.message || data.result);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Transactions API] Error:', error);
    return NextResponse.json(
      { status: "0", message: "Error fetching transaction data", result: [] },
      { status: 500 }
    );
  }
}