import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const contractAddress = searchParams.get('address');
    
    if (!contractAddress) {
      return NextResponse.json({ error: 'Contract address is required' }, { status: 400 });
    }

    const polygonscanApiKey = process.env.POLYGONSCAN_API_KEY || process.env.NEXT_PUBLIC_POLYGONSCAN_API_KEY || '';
    const apiUrl = `https://api.etherscan.io/v2/api?chainid=137&module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${polygonscanApiKey}`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();

    logger.log('Polygonscan token info response:', data);

    return NextResponse.json(data);

  } catch (error) {
    logger.error('Error fetching token info from Polygonscan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token info' },
      { status: 500 }
    );
  }
}