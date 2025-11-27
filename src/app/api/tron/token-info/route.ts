import { NextRequest, NextResponse } from 'next/server';
import { SecureTronService } from '@/lib/tron-server';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const { tokenAddress } = await req.json();
    
    if (!tokenAddress) {
      return NextResponse.json({ error: 'Token address is required' }, { status: 400 });
    }
    
    // Validate TRON address format
    if (!tokenAddress.startsWith('T') || tokenAddress.length !== 34) {
      return NextResponse.json({ 
        error: 'Invalid TRON token address',
        message: 'TRON addresses must start with T and be 34 characters long'
      }, { status: 400 });
    }
    
    logger.log('[Tron Token Info API] Fetching info for:', tokenAddress);
    
    try {
      const tokenInfo = await SecureTronService.getTokenInfo(tokenAddress);
      
      if (!tokenInfo) {
        return NextResponse.json({ 
          error: 'Token not found',
          message: 'Could not retrieve token information'
        }, { status: 404 });
      }
      
      return NextResponse.json({
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals,
        totalSupply: tokenInfo.totalSupply,
        address: tokenAddress
      });
      
    } catch (error: any) {
      logger.error('[Tron Token Info API] Error fetching token info:', error);
      
      if (error.message?.includes('Contract does not exist')) {
        return NextResponse.json({ 
          error: 'Invalid token contract',
          message: 'The specified address is not a valid TRC-20 token contract'
        }, { status: 400 });
      }
      
      throw error;
    }
    
  } catch (error) {
    logger.error('[Tron Token Info API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch token info',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}