import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const polygonscanApiKey = process.env.POLYGONSCAN_API_KEY || process.env.NEXT_PUBLIC_POLYGONSCAN_API_KEY || '';

    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '10';

    // Debug logging
    console.log('[Polygon Transactions API] Fetching transactions for:', address);
    console.log('[Polygon Transactions API] Page:', page, 'Limit:', limit);

    // Helper to add delay
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Add initial delay to avoid rate limiting
    await delay(1000);

    // Fetch native transactions first
    console.log('[Polygon Transactions API] Fetching native transactions...');
    const nativeTxsResponse = await fetch(
      `https://api.etherscan.io/v2/api?chainid=137&module=account&action=txlist&address=${address}&sort=desc&page=${page}&offset=${limit}&apikey=${polygonscanApiKey}`
    );

    // Wait 2 seconds before fetching token transactions
    await delay(2000);

    // Fetch token transactions
    console.log('[Polygon Transactions API] Fetching token transactions...');
    const tokenTxsResponse = await fetch(
      `https://api.etherscan.io/v2/api?chainid=137&module=account&action=tokentx&address=${address}&sort=desc&page=${page}&offset=${limit}&apikey=${polygonscanApiKey}`
    );

    const nativeTxs = await nativeTxsResponse.json();
    console.log('[Polygon Transactions API] Native transactions fetched:', nativeTxs.result?.length || 0);

    // Wait 1 second before parsing token transactions
    await delay(1000);

    const tokenTxs = await tokenTxsResponse.json();
    console.log('[Polygon Transactions API] Token transactions fetched:', tokenTxs.result?.length || 0);

    console.log('[Polygon Transactions API] API responses:', {
      nativeStatus: nativeTxs.status,
      tokenStatus: tokenTxs.status,
      nativeCount: nativeTxs.result?.length || 0,
      tokenCount: tokenTxs.result?.length || 0
    });

    // Return combined results
    return NextResponse.json({
      nativeTxs,
      tokenTxs
    });

  } catch (error) {
    logger.error('Error fetching Polygon transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}