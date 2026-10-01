import { NextResponse } from 'next/server';

import { getVocabLive } from '@/lib/vocab-live';

export const dynamic = 'force-dynamic';

export async function GET() {
  const live = getVocabLive();
  return NextResponse.json(
    { ok: true, live },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
