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
    logger.log('Local API Debug:', {
      address,
      page,
      limit,
      apiKeyLength: polygonscanApiKey.length,
      apiKeyPrefix: polygonscanApiKey.substring(0, 8) + '...'
    });
    
    // Fetch both native and token transactions in parallel using Etherscan v2 API with pagination
    const [nativeTxsResponse, tokenTxsResponse] = await Promise.all([
      fetch(`https://api.etherscan.io/v2/api?chainid=137&module=account&action=txlist&address=${address}&sort=desc&page=${page}&offset=${limit}&apikey=${polygonscanApiKey}`),
      fetch(`https://api.etherscan.io/v2/api?chainid=137&module=account&action=tokentx&address=${address}&sort=desc&page=${page}&offset=${limit}&apikey=${polygonscanApiKey}`)
    ]);

    const [nativeTxs, tokenTxs] = await Promise.all([
      nativeTxsResponse.json(),
      tokenTxsResponse.json()
    ]);

    logger.log('Polygonscan API responses:', {
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