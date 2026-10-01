'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type EventItem = {
  id: string | number;
  title: string;
  day: string;
  start: string;
  endTime?: string | null;
  soundUrl?: string | null;
  note?: string | null;
};

type PlayCallbacks = {
  onPlayed: () => void;
  onBlocked: () => void;
};

const AUDIO_UNLOCKED_KEY = 'clock-audio-unlocked';

function playAudioWithFallback(audio: HTMLAudioElement, callbacks: PlayCallbacks) {
  try {
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      void playPromise.then(callbacks.onPlayed).catch(callbacks.onBlocked);
      return;
    }
    callbacks.onPlayed();
  } catch {
    callbacks.onBlocked();
  }
}

function formatDayLabel(day: string) {
  const map: Record<string, string> = {
    senin: 'Monday',
    selasa: 'Tuesday',
    rabu: 'Wednesday',
    kamis: 'Thursday',
    jumat: 'Friday',
    sabtu: 'Saturday',
    minggu: 'Sunday',
  };

  return map[day.toLowerCase()] ?? day.charAt(0).toUpperCase() + day.slice(1);
}

function EventCard({ event }: { event: EventItem }) {
  return (
    <div className="info-card event-slot__card">
      <div className="info-card__top">
        <strong>{event.title}</strong>
        <span>{formatDayLabel(event.day)}</span>
      </div>
      <div className="info-card__bottom">
        <span>
          {event.start}
          {event.endTime ? ` - ${event.endTime}` : ''}
        </span>
        {event.note ? <p>{event.note}</p> : null}
      </div>
    </div>
  );
}

function toMinutes(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function getJakartaCurrentMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function getActiveEvent(events: EventItem[], now: Date) {
  if (!events.length) {
    return null;
  }

  const schedule = events
    .map((event) => ({
      event,
      startMinutes: toMinutes(event.start),
      endMinutes: event.endTime ? toMinutes(event.endTime) : null,
    }))
    .filter((entry) => entry.startMinutes !== null)
    .sort((left, right) => (left.startMinutes ?? 0) - (right.startMinutes ?? 0));

  if (!schedule.length) {
    return null;
  }

  const nowMinutes = getJakartaCurrentMinutes(now);

  const active = schedule.find((entry, index) => {
    const next = schedule[index + 1];
    const inferredEnd = next?.startMinutes ?? Math.min((entry.startMinutes ?? 0) + 60, 23 * 60 + 59);
    const resolvedEnd = entry.endMinutes ?? inferredEnd;
    const start = entry.startMinutes ?? 0;
    const end = Math.max(resolvedEnd ?? inferredEnd, start);
    return nowMinutes >= start && nowMinutes < end;
  });

  return active?.event ?? null;
}

export function EventSlotMachine({ events, soundUrl }: { events: EventItem[]; soundUrl?: string }) {
  const orderedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const leftMinutes = toMinutes(left.start) ?? 99_999;
        const rightMinutes = toMinutes(right.start) ?? 99_999;
        if (leftMinutes !== rightMinutes) {
          return leftMinutes - rightMinutes;
        }
        return String(left.id).localeCompare(String(right.id));
      }),
    [events],
  );

  const [now, setNow] = useState(() => new Date());
  const previousEventKeyRef = useRef('');
  const initializedRef = useRef(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudioPlayRef = useRef(false);

  useEffect(() => {
    const markAudioUnlocked = () => {
      window.localStorage.setItem(AUDIO_UNLOCKED_KEY, '1');
    };

    window.addEventListener('pointerdown', markAudioUnlocked, { passive: true });
    window.addEventListener('keydown', markAudioUnlocked);
    window.addEventListener('touchstart', markAudioUnlocked, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', markAudioUnlocked);
      window.removeEventListener('keydown', markAudioUnlocked);
      window.removeEventListener('touchstart', markAudioUnlocked);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const currentEvent = getActiveEvent(orderedEvents, now);
  const currentEventKey = currentEvent ? `${String(currentEvent.id)}-${currentEvent.start}` : '';

  useEffect(() => {
    const retryPendingAudio = () => {
      if (!pendingAudioPlayRef.current || !activeAudioRef.current) {
        return;
      }
      activeAudioRef.current.currentTime = 0;
      playAudioWithFallback(activeAudioRef.current, {
        onPlayed: () => {
          pendingAudioPlayRef.current = false;
        },
        onBlocked: () => {
          pendingAudioPlayRef.current = true;
        },
      });
    };

    window.addEventListener('pointerdown', retryPendingAudio, { passive: true });
    window.addEventListener('keydown', retryPendingAudio);
    window.addEventListener('touchstart', retryPendingAudio, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', retryPendingAudio);
      window.removeEventListener('keydown', retryPendingAudio);
      window.removeEventListener('touchstart', retryPendingAudio);
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current) {
      previousEventKeyRef.current = currentEventKey;
      initializedRef.current = true;
      return;
    }

    if (previousEventKeyRef.current === currentEventKey) {
      return;
    }
    previousEventKeyRef.current = currentEventKey;

    if (!currentEventKey) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      pendingAudioPlayRef.current = false;
      return;
    }

    const nextSoundUrl = (currentEvent?.soundUrl || soundUrl || '').trim();
    if (!nextSoundUrl) {
      pendingAudioPlayRef.current = false;
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    const audio = new Audio(nextSoundUrl);
    audio.preload = 'auto';
    audio.setAttribute('playsinline', 'true');
    activeAudioRef.current = audio;
    playAudioWithFallback(audio, {
      onPlayed: () => {
        pendingAudioPlayRef.current = false;
      },
      onBlocked: () => {
        pendingAudioPlayRef.current = true;
      },
    });
  }, [currentEvent, currentEventKey, soundUrl]);

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      pendingAudioPlayRef.current = false;
    };
  }, []);

  if (!currentEvent) {
    return <p className="fallback-note">No active event at this time.</p>;
  }

  return (
    <div className="event-slot">
      <EventCard event={currentEvent} />
    </div>
  );
}
