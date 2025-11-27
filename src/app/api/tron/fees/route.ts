import { NextRequest, NextResponse } from 'next/server';
import { SecureTronService } from '@/lib/tron-server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const amount = searchParams.get('amount');
    const token = searchParams.get('token');
    
    if (!from || !to || !amount) {
      return NextResponse.json({ 
        error: 'Missing required parameters',
        required: ['from', 'to', 'amount']
      }, { status: 400 });
    }
    
    const fees = await SecureTronService.estimateFees(
      from,
      to,
      parseFloat(amount),
      token || undefined
    );
    
    // Get current TRX price for fee calculation
    let trxPrice = 0.13;
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd');
      const priceData = await priceResponse.json();
      trxPrice = priceData.tron?.usd || 0.13;
    } catch (e) {
      logger.warn('[Tron Fees API] Failed to fetch TRX price, using default');
    }
    
    return NextResponse.json({
      success: true,
      fees: {
        energy: fees.energy,
        bandwidth: fees.bandwidth,
        estimatedFee: fees.estimatedFee,
        feeInTRX: fees.feeInTRX,
        feeInUSD: fees.feeInTRX * trxPrice,
        trxPrice,
      },
      gasless: {
        available: true,
        message: 'Gasless transactions available for all tokens',
        supported: ['TRX', 'USDT', 'USDC', 'BTT', 'JST', 'WIN', 'SUN'],
      },
      resources: {
        message: token === 'TRX' 
          ? 'TRX transfers use bandwidth (1500 free daily)'
          : 'Token transfers use energy (can be delegated)',
      }
    });
  } catch (error) {
    logger.error('[Tron Fees API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to estimate fees',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Convert POST to GET parameters
  const params = new URLSearchParams({
    from: body.from || '',
    to: body.to || '',
    amount: body.amount?.toString() || '',
    token: body.token || '',
  });
  
  const getRequest = new NextRequest(
    `${request.url}?${params.toString()}`,
    { method: 'GET' }
  );
  
  return GET(getRequest);
}