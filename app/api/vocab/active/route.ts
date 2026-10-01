import { NextResponse } from 'next/server';

import { getVocabItems, getVocabSlots } from '@/lib/db';
import { findActiveSlot, getJakartaNow } from '@/lib/vocab';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const slots = getVocabSlots();
    const active = findActiveSlot(slots, getJakartaNow());
    if (!active) {
      return NextResponse.json(
        { ok: true, slot: null, items: [] },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const items = getVocabItems();
    return NextResponse.json(
      { ok: true, slot: active, items },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { ok: true, slot: null, items: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
