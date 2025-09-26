import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { contractAddress } = await req.json();
    if (!contractAddress) {
      return NextResponse.json({ error: '토큰 주소가 필요합니다.' }, { status: 400 });
    }
    const apiKey = process.env.NEXT_PUBLIC_POLYGONSCAN_API_KEY || 'MG6RJ6UYNEV5MWH9BABFHCYIJNGUNX248E';
    const apiUrl = `https://api.etherscan.io/v2/api?chainid=137&module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${apiKey}`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      return NextResponse.json({ error: 'Polygonscan 요청에 실패했습니다.' }, { status: 502 });
    }
    const data = await res.json();
    if (data.status !== '1' || !data.result || !data.result[0]) {
      return NextResponse.json({ error: 'Polygonscan에서 토큰 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ token: data.result[0] });
  } catch (err) {
    return NextResponse.json({ error: '토큰 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }
} 