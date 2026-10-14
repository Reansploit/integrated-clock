import { NextResponse } from 'next/server';

import {
  claimRecitationRun,
  ensureDatabase,
  findRunningRecitationRun,
  getRecitationItems,
  getRecitationRun,
  getRecitationSlots,
  getSoundDurations,
} from '@/lib/db';
import { isScheduledDay, jakartaDateKey, planRun, resolveSlotWindow, type RecitationPlan } from '@/lib/recitation';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * The board's window on the schedule.
 *
 * A slot is claimed once per day through the run row's UNIQUE key, so a board
 * that reloads mid-run comes back to the same run instead of starting a second
 * one, and two boards polling together still produce one plan. The plan itself
 * is computed here and handed over whole: the board plays the files it is
 * given, in order, and never has to decide what fits.
 */
export async function GET() {
  try {
    ensureDatabase();

    const now = new Date();
    const dateKey = jakartaDateKey(now);
    const slots = getRecitationSlots().filter((slot) => slot.enabled);
    const durations = getSoundDurations();

    if (!slots.length) {
      return NextResponse.json({ ok: true, run: null, slots: [] }, { headers: NO_STORE });
    }

    for (const slot of slots) {
      if (!isScheduledDay(slot.days, now)) {
        continue;
      }

      const window = resolveSlotWindow(slot, now);
      const runKey = `${dateKey}|${slot.id}`;
      const existing = getRunByKey(runKey);

      // A run claimed earlier keeps serving, even if it drifted past the grace
      // window while playing, so a reload does not replay the slot from the top.
      if (existing) {
        return NextResponse.json(
          { ok: true, run: existing, window: { startIso: new Date(window.startMs).toISOString() } },
          { headers: NO_STORE },
        );
      }

      const plan = planRun({ slot, items: getRecitationItems(slot.id), durations, now });
      if (plan.status === 'planned' && !plan.planned.length) {
        continue;
      }

      const running = findRunningRecitationRun(runKey);
      if (running && plan.status === 'planned') {
        // One recitation at a time. The blocked slot is recorded so the
        // operator can see it was skipped rather than silently lost.
        claimRecitationRun({
          runKey,
          slotId: slot.id,
          slotLabel: slot.label,
          dateKey,
          startIso: new Date(window.startMs).toISOString(),
          deadlineIso: new Date(window.deadlineMs).toISOString(),
          planJson: JSON.stringify(plan.planned),
          status: 'skipped',
          reason: `Bentrok dengan "${running.slotLabel}" yang masih bunyi.`,
        });
        continue;
      }

      const run = claimRecitationRun({
        runKey,
        slotId: slot.id,
        slotLabel: slot.label,
        dateKey,
        startIso: new Date(window.startMs).toISOString(),
        deadlineIso: new Date(window.deadlineMs).toISOString(),
        planJson: JSON.stringify(plan),
        status: plan.status === 'planned' ? 'planned' : plan.status,
        reason: plan.reason,
      });

      return NextResponse.json(
        {
          ok: true,
          run,
          window: {
            startIso: new Date(window.startMs).toISOString(),
            deadlineIso: new Date(window.deadlineMs).toISOString(),
          },
          plan,
        },
        { headers: NO_STORE },
      );
    }

    return NextResponse.json({ ok: true, run: null, slots: [] }, { headers: NO_STORE });
  } catch {
    // A display must stay silent rather than show a scheduler error.
    return NextResponse.json({ ok: true, run: null, slots: [] }, { headers: NO_STORE });
  }
}

function getRunByKey(runKey: string) {
  const run = getRecitationRun(runKey);
  if (!run) return null;

  return { ...run, plan: parsePlan(run.planJson) };
}

function parsePlan(raw: string): RecitationPlan | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.planned)) {
      return parsed as RecitationPlan;
    }
    // A plan written by the collision path stores only the planned array.
    return {
      status: 'planned',
      reason: '',
      planned: parsed,
      dropped: [],
      windowSec: 0,
    } as RecitationPlan;
  } catch {
    return null;
  }
}
