// Proxy all Tron API calls to the central backend
import { NextRequest, NextResponse } from 'next/server';

const TRON_API_BASE = 'https://gptchwallet.com/api/tron';

async function handleRequest(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }, method: string) {
  try {
    const resolvedParams = await params;
    const path = resolvedParams.path ? resolvedParams.path.join('/') : '';
    const queryString = request.nextUrl.search;
    const fetchUrl = `${TRON_API_BASE}/${path}${queryString}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method !== 'GET' && method !== 'HEAD') {
      options.body = await request.text();
    }

    const response = await fetch(fetchUrl, options);
    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Tron API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handleRequest(request, context, 'GET');
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handleRequest(request, context, 'POST');
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handleRequest(request, context, 'PUT');
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handleRequest(request, context, 'DELETE');
}