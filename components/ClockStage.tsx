'use client';

import { AnalogClock } from '@/components/AnalogClock';
import { LiveClock } from '@/components/LiveClock';
import type { PrayerTimes } from '@/lib/prayer';

type ClockStageProps = {
  temp?: number | null;
  prayerTimes: PrayerTimes | null;
  hijriDate: string;
  homecoming: string;
  exam: string;
};

/**
 * The clock group: analog face and digital readout, with the prayer countdown
 * beside the temperature below the time, then the two event countdowns. They
 * are grouped because they answer one question, what time is it, and the rail
 * stays a pure schedule list.
 */
export function ClockStage({ temp, prayerTimes, hijriDate, homecoming, exam }: ClockStageProps) {
  return (
    <section className="clock-stage">
      <AnalogClock />
      <div className="clock-stage__digital">
        <LiveClock temp={temp} prayerTimes={prayerTimes} hijriDate={hijriDate} />
        <div className="adhan-counter">
          <div className="adhan-counter__label">Going Home</div>
          <div className="adhan-counter__value">{homecoming}</div>
        </div>
        <div className="adhan-counter">
          <div className="adhan-counter__label">Exam</div>
          <div className="adhan-counter__value">{exam}</div>
        </div>
      </div>
    </section>
  );
}