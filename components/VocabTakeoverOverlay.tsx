'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { findActiveSlot, getJakartaNow, pickNextIndex, type VocabSlot } from '@/lib/vocab';

export type VocabItem = {
  id: string | number;
  english: string;
  arabic: string;
  meaning: string;
  exampleAr: string;
  exampleMeaning: string;
  audioUrl: string;
};

type ActivePayload = {
  slot?: VocabSlot | null;
  items?: VocabItem[];
};

type LivePayload = {
  live?: { slotId: number; index: number; nonce: string } | null;
};

const AUDIO_UNLOCKED_KEY = 'vocab-audio-unlocked';
const REFRESH_MS = 30_000;
const LIVE_POLL_MS = 3_000;

function clampIntervalSec(value: number) {
  if (!Number.isFinite(value)) return 10;
  return Math.min(120, Math.max(3, Math.floor(value)));
}

function VocabClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const parts = useMemo(() => {
    if (!now) return { hh: '--', mm: '--', day: '…' };
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const byType = new Map(fmt.map((part) => [part.type, part.value]));
    const day = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' }).format(now);
    return { hh: byType.get('hour') || '--', mm: byType.get('minute') || '--', day };
  }, [now]);

  return (
    <div className="vocab-clock" aria-label={`Jam ${parts.hh}:${parts.mm}`}>
      <span className="vocab-clock__digits">{parts.hh}</span>
      <span className="vocab-clock__colon" aria-hidden="true">:</span>
      <span className="vocab-clock__digits">{parts.mm}</span>
      <span className="vocab-clock__day">{parts.day}</span>
    </div>
  );
}

export function VocabTakeoverOverlay({
  slots,
  items,
}: {
  slots: VocabSlot[];
  items: VocabItem[];
}) {
  const [tick, setTick] = useState(() => Date.now());
  const [remoteSlots, setRemoteSlots] = useState<VocabSlot[] | null>(null);
  const [remoteItems, setRemoteItems] = useState<VocabItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [liveIndex, setLiveIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const effectiveSlots = remoteSlots ?? slots;
  const effectiveItems = useMemo(
    () => (remoteItems ?? items).filter((item) => item.arabic.trim() || item.english.trim()),
    [remoteItems, items],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeSlot = useMemo(
    () => findActiveSlot(effectiveSlots, getJakartaNow(new Date(tick))),
    [effectiveSlots, tick],
  );

  const refreshSchedule = useCallback(async () => {
    try {
      const response = await fetch('/api/vocab/active', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json()) as ActivePayload;
      if (Array.isArray(payload.items)) setRemoteItems(payload.items);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (!activeSlot) return;
    const timer = window.setInterval(refreshSchedule, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeSlot, refreshSchedule]);

  useEffect(() => {
    if (!activeSlot || activeSlot.mode !== 'manual') {
      setLiveIndex(null);
      return;
    }
    let mounted = true;
    const poll = async () => {
      try {
        const response = await fetch('/api/vocab/live', { cache: 'no-store' });
        if (!response.ok || !mounted) return;
        const payload = (await response.json()) as LivePayload;
        if (payload.live && payload.live.slotId === activeSlot.id) {
          setLiveIndex(payload.live.index);
        }
      } catch {
        // Keep last manual index on poll failure.
      }
    };
    void poll();
    const timer = window.setInterval(poll, LIVE_POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [activeSlot]);

  useEffect(() => {
    setIndex(0);
    setLiveIndex(null);
  }, [activeSlot?.id]);

  const visibleIndex = activeSlot?.mode === 'manual' && liveIndex !== null
    ? liveIndex % Math.max(1, effectiveItems.length)
    : index % Math.max(1, effectiveItems.length);

  useEffect(() => {
    if (!activeSlot || activeSlot.mode !== 'auto' || effectiveItems.length <= 1) return;
    const intervalSec = clampIntervalSec(activeSlot.intervalSec);
    const timer = window.setInterval(() => {
      setIndex((current) => pickNextIndex(current, effectiveItems.length, activeSlot.orderMode));
    }, intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [activeSlot, effectiveItems.length]);

  useEffect(() => {
    document.documentElement.classList.toggle('vocab-takeover', Boolean(activeSlot));
    return () => document.documentElement.classList.remove('vocab-takeover');
  }, [activeSlot]);

  useEffect(() => {
    const markUnlocked = () => window.localStorage.setItem(AUDIO_UNLOCKED_KEY, '1');
    window.addEventListener('pointerdown', markUnlocked, { passive: true });
    window.addEventListener('keydown', markUnlocked);
    return () => {
      window.removeEventListener('pointerdown', markUnlocked);
      window.removeEventListener('keydown', markUnlocked);
    };
  }, []);

  useEffect(() => {
    if (!activeSlot) return;
    const current = effectiveItems[visibleIndex];
    const src = current?.audioUrl?.trim();
    if (!src || window.localStorage.getItem(AUDIO_UNLOCKED_KEY) !== '1') return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(src);
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [activeSlot, visibleIndex, effectiveItems]);

  if (!activeSlot) return null;

  if (!effectiveItems.length) {
    return (
      <div className="vocab-takeover" role="status">
        <div className="vocab-takeover__empty">
          <strong>{activeSlot.title}</strong>
          <p>Belum ada kartu vocab di slot ini. Tambahkan di halaman Vocab Control.</p>
        </div>
        <VocabClock />
      </div>
    );
  }

  const current = effectiveItems[visibleIndex];
  const intervalSec = clampIntervalSec(activeSlot.intervalSec);

  return (
    <div className="vocab-takeover" role="presentation">
      <div className="vocab-takeover__main">
        <div className="vocab-takeover__head">
          <span className="vocab-takeover__badge">{activeSlot.title}</span>
          <span className="vocab-takeover__time">
            {activeSlot.start}–{activeSlot.end}
          </span>
        </div>
        <div className="vocab-takeover__stage">
          <div key={`${activeSlot.id}-${current.id}-${visibleIndex}`} className="vocab-takeover__card">
            <div className="vocab-takeover__pair">
              <span className="vocab-takeover__english">{current.english || '—'}</span>
              <span className="vocab-takeover__sep" aria-hidden="true">/</span>
              <span className="vocab-takeover__arabic">{current.arabic || '—'}</span>
            </div>
            <p className="vocab-takeover__meaning">{current.meaning || '—'}</p>
            {current.exampleAr || current.exampleMeaning ? (
              <div className="vocab-takeover__example">
                {current.exampleAr ? <p className="vocab-takeover__example-ar">{current.exampleAr}</p> : null}
                {current.exampleMeaning ? <p className="vocab-takeover__example-id">{current.exampleMeaning}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="vocab-takeover__foot">
          <div className="vocab-takeover__dots" aria-hidden="true">
            {effectiveItems.slice(0, 12).map((item, dotIndex) => (
              <span
                key={item.id}
                className={dotIndex === visibleIndex % 12 ? 'is-on' : ''}
              />
            ))}
          </div>
          <span className="vocab-takeover__count">
            {visibleIndex + 1}/{effectiveItems.length}
            {activeSlot.mode === 'manual' ? ' • manual' : ''}
          </span>
        </div>
        {activeSlot.mode === 'auto' && effectiveItems.length > 1 ? (
          <div
            key={`bar-${visibleIndex}`}
            className="vocab-takeover__progress"
            style={{ animationDuration: `${intervalSec}s` }}
          />
        ) : null}
        {loadError ? <p className="vocab-takeover__warn">Koneksi pembaruan lambat, menampilkan jadwal tersimpan.</p> : null}
      </div>
      <aside className="vocab-takeover__side">
        <VocabClock />
      </aside>
    </div>
  );
}
