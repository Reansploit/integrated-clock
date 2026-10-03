'use client';

import { AdhanCountdown } from '@/components/AdhanCountdown';
import { AnalogClock } from '@/components/AnalogClock';
import { LiveClock } from '@/components/LiveClock';
import type { PrayerTimes } from '@/lib/prayer';

type ClockStageProps = {
  temp?: number | null;
  prayerTimes: PrayerTimes | null;
};

/**
 * The clock group: analog face, digital readout, and the prayer countdown. They
 * are grouped because they answer one question, what time is it, and the
 * countdown belongs with the clock rather than in the schedule rail.
 */
export function ClockStage({ temp, prayerTimes }: ClockStageProps) {
  return (
    <section className="clock-stage">
      <AnalogClock />
      <div className="clock-stage__digital">
        <LiveClock temp={temp} />
        <AdhanCountdown prayerTimes={prayerTimes} />
      </div>
    </section>
  );
}