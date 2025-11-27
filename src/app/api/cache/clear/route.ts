import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // This endpoint can be used to clear caches if needed
  return NextResponse.json({ 
    message: 'Cache clearing endpoint',
    note: 'Caches are automatically cleared after their TTL expires'
  });
}