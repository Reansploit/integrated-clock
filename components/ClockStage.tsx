'use client';

import { AnalogClock } from '@/components/AnalogClock';
import { LiveClock } from '@/components/LiveClock';
import type { PrayerTimes } from '@/lib/prayer';

type ClockStageProps = {
  temp?: number | null;
  prayerTimes: PrayerTimes | null;
};

/**
 * The clock group: analog face and digital readout, with the prayer countdown
 * beside the temperature below the time. They are grouped because they answer
 * one question, what time is it, and the rail stays a pure schedule list.
 */
export function ClockStage({ temp, prayerTimes }: ClockStageProps) {
  return (
    <section className="clock-stage">
      <AnalogClock />
      <div className="clock-stage__digital">
        <LiveClock temp={temp} prayerTimes={prayerTimes} />
      </div>
    </section>
  );
}