import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ensureDatabase, saveSoundDuration } from '@/lib/db';

export const dynamic = 'force-dynamic';

const durationSchema = z.object({
  entries: z
    .array(
      z.object({
        url: z.string().min(1).max(500),
        durationMs: z.number().int().min(0).max(24 * 3600 * 1000),
      }),
    )
    .min(1)
    .max(400),
});

/**
 * Durations measured in a browser, stored once per file.
 *
 * The planner refuses to put an unmeasured file on a run, because a file whose
 * length it cannot prove might run past the deadline. Whoever holds a browser -
 * the console operator or the board itself on first play - reports the number
 * it read from the loaded metadata.
 */
export async function POST(request: Request) {
  try {
    ensureDatabase();

    const body = await request.json();
    const parsed = durationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    let saved = 0;
    for (const entry of parsed.data.entries) {
      if (entry.durationMs <= 0) continue;
      saveSoundDuration(entry.url, entry.durationMs);
      saved += 1;
    }

    return NextResponse.json({ ok: true, saved }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
