import { NextResponse } from 'next/server';

import { getEventSoundData } from '@/lib/db';

type EventSoundParams = {
  id: string;
};

export async function GET(_request: Request, { params }: { params: Promise<EventSoundParams> }) {
  const { id } = await params;
  const soundId = Number.parseInt(id, 10);
  if (!Number.isFinite(soundId) || soundId <= 0) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const sound = getEventSoundData(soundId);
    if (!sound?.audioData) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(new Uint8Array(sound.audioData), {
      headers: {
        'Content-Type': sound.mimeType || 'audio/mpeg',
        'Content-Length': String(sound.sizeBytes || sound.audioData.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
