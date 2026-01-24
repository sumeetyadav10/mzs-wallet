import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const MZS_ADDRESS = "0x1aDb749FFDA33251e1503672951b5A4234518Fa7";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, customTokens } = body;

    console.log('[Polygon Balance API] Request received for address:', address);

    if (!address) {
      console.error('[Polygon Balance API] No address provided');
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // Validate address format
    if (!ethers.isAddress(address)) {
      console.error('[Polygon Balance API] Invalid address format:', address);
      return NextResponse.json({ error: 'Invalid Ethereum address' }, { status: 400 });
    }

    // Check RPC URL
    const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL;
    if (!rpcUrl) {
      console.error('[Polygon Balance API] RPC URL not configured');
      return NextResponse.json({ error: 'RPC configuration missing' }, { status: 500 });
    }

    console.log('[Polygon Balance API] Using RPC URL:', rpcUrl);

    // Create provider WITHOUT network parameter to avoid gasstation calls
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Helper to add delay between RPC calls (LONG delays to avoid rate limiting)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // IMPORTANT: Add initial delay before first request
    await delay(1000);

    // Get MATIC balance
    console.log('[Polygon Balance API] Fetching MATIC balance...');
    const maticBalance = await provider.getBalance(address);
    console.log('[Polygon Balance API] MATIC balance:', ethers.formatEther(maticBalance));

    // Wait 3 seconds before next call
    await delay(3000);

    // Get MZS token balance
    console.log('[Polygon Balance API] Fetching MZS token balance...');
    const mzsContract = new ethers.Contract(MZS_ADDRESS, ERC20_ABI, provider);

    const mzsRaw = await mzsContract.balanceOf(address);
    console.log('[Polygon Balance API] MZS balanceOf fetched');

    // Wait 3 seconds before next call
    await delay(3000);

    const mzsDecimals = await mzsContract.decimals();
    console.log('[Polygon Balance API] MZS decimals fetched:', mzsDecimals);

    // Wait 3 seconds before next call
    await delay(3000);

    const mzsSymbol = await mzsContract.symbol();
    console.log('[Polygon Balance API] MZS symbol fetched:', mzsSymbol);

    // Wait 3 seconds before processing custom tokens
    await delay(3000);

    console.log('[Polygon Balance API] MZS balance:', ethers.formatUnits(mzsRaw, mzsDecimals));

    // Format balances
    const tokens: any[] = [];

    // Add MZS token
    tokens.push({
      address: MZS_ADDRESS,
      symbol: mzsSymbol,
      name: 'MZS Token',
      decimals: Number(mzsDecimals),
      balance: parseFloat(ethers.formatUnits(mzsRaw, mzsDecimals)),
      balanceRaw: mzsRaw.toString()
    });

    // Fetch custom tokens if provided
    if (customTokens && Array.isArray(customTokens) && customTokens.length > 0) {
      console.log('[Polygon Balance API] Fetching custom tokens:', customTokens.length);

      for (const tokenAddress of customTokens) {
        try {
          if (!ethers.isAddress(tokenAddress)) {
            console.warn('[Polygon Balance API] Invalid token address:', tokenAddress);
            continue;
          }

          console.log('[Polygon Balance API] Fetching token:', tokenAddress);
          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

          // Fetch sequentially with LONG delays (3 seconds each)
          const tokenBalance = await tokenContract.balanceOf(address);
          console.log('[Polygon Balance API] Token balanceOf fetched');
          await delay(3000);

          const tokenDecimals = await tokenContract.decimals();
          console.log('[Polygon Balance API] Token decimals fetched:', tokenDecimals);
          await delay(3000);

          const tokenSymbol = await tokenContract.symbol();
          console.log('[Polygon Balance API] Token symbol fetched:', tokenSymbol);
          await delay(3000);

          const tokenName = await tokenContract.name();
          console.log('[Polygon Balance API] Token name fetched:', tokenName);
          await delay(3000);

          tokens.push({
            address: tokenAddress,
            symbol: tokenSymbol,
            name: tokenName,
            decimals: Number(tokenDecimals),
            balance: parseFloat(ethers.formatUnits(tokenBalance, tokenDecimals)),
            balanceRaw: tokenBalance.toString()
          });

          console.log('[Polygon Balance API] Token fetched:', tokenSymbol, tokenBalance.toString());
        } catch (error) {
          console.error(`[Polygon Balance API] Error fetching token ${tokenAddress}:`, error);
          // Continue with other tokens
        }
      }
    }

    const response = {
      maticBalance: parseFloat(ethers.formatEther(maticBalance)),
      maticBalanceRaw: maticBalance.toString(),
      tokens,
      source: 'secure-server',
      timestamp: Date.now()
    };

    console.log('[Polygon Balance API] Success - returning response');
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Polygon Balance API] Error:', error);
    console.error('[Polygon Balance API] Error stack:', error.stack);

    // Return detailed error in development
    return NextResponse.json({
      error: 'Failed to fetch balance',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

// Rate limiting helper
const rateLimitMap = new Map();

function isRateLimited(clientId: string): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 30; // 30 requests per minute

  const clientRequests = rateLimitMap.get(clientId) || [];

  // Filter out old requests
  const validRequests = clientRequests.filter((timestamp: number) => now - timestamp < windowMs);

  if (validRequests.length >= maxRequests) {
    return true;
  }

  validRequests.push(now);
  rateLimitMap.set(clientId, validRequests);

  return false;
}

// GET endpoint for convenience
export async function GET(req: NextRequest) {
  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown';
  if (isRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const searchParams = req.nextUrl.searchParams;
  const address = searchParams.get('address');
  const customTokensParam = searchParams.get('customTokens');

  if (!address) {
    return NextResponse.json({ error: 'Address parameter required' }, { status: 400 });
  }

  let customTokens: string[] = [];
  if (customTokensParam) {
    try {
      customTokens = JSON.parse(customTokensParam);
    } catch (e) {
      // Ignore parsing errors
    }
  }

  // Reuse POST logic
  return POST(new NextRequest(req.url, {
    method: 'POST',
    body: JSON.stringify({ address, customTokens }),
  }));
}
