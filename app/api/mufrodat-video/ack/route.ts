import { NextRequest, NextResponse } from 'next/server';

import { clearMufrodatVideoPlayback } from '@/app/admin/actions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const playbackNonce = String((body as { playbackNonce?: string }).playbackNonce || '').trim();

    if (!playbackNonce) {
      return NextResponse.json({ ok: true });
    }

    await clearMufrodatVideoPlayback(playbackNonce);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
