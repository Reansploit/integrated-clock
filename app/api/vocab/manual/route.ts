import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { getVocabSlots } from '@/lib/db';
import { clearVocabLive, setVocabLive } from '@/lib/vocab-live';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      slotId?: number;
      index?: number;
      stop?: boolean;
    };

    if (body.stop) {
      clearVocabLive();
      return NextResponse.json({ ok: true });
    }

    const slotId = Number(body.slotId);
    const index = Math.max(0, Math.floor(Number(body.index) || 0));
    if (!Number.isFinite(slotId) || slotId <= 0) {
      return NextResponse.json({ ok: false, reason: 'invalid_slot' }, { status: 400 });
    }

    const slot = getVocabSlots().find((entry) => entry.id === slotId);
    if (!slot) {
      return NextResponse.json({ ok: false, reason: 'slot_not_found' }, { status: 404 });
    }
    if (slot.mode !== 'manual') {
      return NextResponse.json({ ok: false, reason: 'slot_not_manual' }, { status: 400 });
    }

    const live = setVocabLive({ slotId, index, nonce: randomUUID() });
    revalidatePath('/');
    return NextResponse.json({ ok: true, live });
  } catch {
    return NextResponse.json({ ok: false, reason: 'failed' }, { status: 500 });
  }
}
