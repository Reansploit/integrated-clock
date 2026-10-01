'use client';

import { AnalogClock } from '@/components/AnalogClock';
import { LiveClock } from '@/components/LiveClock';

type ClockStageProps = {
  temp?: number | null;
};

export function ClockStage({ temp }: ClockStageProps) {
  return (
    <div className="clock-stage">
      <AnalogClock />
      <LiveClock temp={temp} />
    </div>
  );
}
