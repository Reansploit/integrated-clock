import { NextResponse } from 'next/server';

import { getRevision } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, revision: getRevision() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, revision: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
