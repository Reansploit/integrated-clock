import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ensureDatabase, getRecitationRun, updateRecitationRunStatus } from '@/lib/db';
import { RECITATION_RUN_STATUSES } from '@/lib/recitation';

export const dynamic = 'force-dynamic';

const progressSchema = z.object({
  runKey: z.string().min(1).max(200),
  status: z.enum(RECITATION_RUN_STATUSES),
  reason: z.string().max(500).optional(),
});

/**
 * The board reporting how a run actually went.
 *
 * `overrun` is the honest outcome when a file turned out longer than its stored
 * duration: the recitation was allowed to finish rather than cut, and the run
 * is flagged so the console can tell the operator to re-measure that file.
 */
export async function POST(request: Request) {
  try {
    ensureDatabase();

    const body = await request.json();
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const run = getRecitationRun(parsed.data.runKey);
    if (!run) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    updateRecitationRunStatus(parsed.data.runKey, parsed.data.status, parsed.data.reason ?? '');

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
