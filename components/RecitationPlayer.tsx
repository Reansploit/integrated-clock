'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { announceRecitationActive, type RecitationBroadcast } from '@/lib/recitation-broadcast';
import type { PlannedRecitation, RecitationPlan } from '@/lib/recitation';

type StatePayload = {
  run?: {
    runKey: string;
    slotLabel: string;
    status: string;
    startIso?: string;
    deadlineIso?: string;
  } | null;
  plan?: RecitationPlan | null;
  gapSec?: number;
};

const POLL_INTERVAL_MS = 10_000;
const AUDIO_UNLOCKED_KEY = 'recitation-audio-unlocked';
const PROGRESS_KEY = 'recitation-progress';
const RETRY_DELAY_MS = 900;
const MAX_PLAY_ERRORS = 3;

const SETTLED_STATUSES = new Set(['done', 'missed', 'empty', 'skipped', 'overrun']);

type Progress = {
  runKey: string;
  index: number;
};

function readProgress(): Progress | null {
  try {
    const raw = window.sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Progress;
    return parsed && typeof parsed.runKey === 'string' && Number.isFinite(parsed.index) ? parsed : null;
  } catch {
    return null;
  }
}

function writeProgress(progress: Progress) {
  try {
    window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // A board with storage disabled still plays; it just restarts on reload.
  }
}

function clearProgress() {
  try {
    window.sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing to clean up.
  }
}

async function reportProgress(runKey: string, status: string, reason = '') {
  try {
    await fetch('/api/recitation/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runKey, status, reason }),
      cache: 'no-store',
    });
  } catch {
    // The run row keeps its planned status; the console still shows the plan.
  }
}

async function reportDuration(url: string, durationMs: number) {
  try {
    await fetch('/api/recitation/duration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [{ url, durationMs }] }),
      cache: 'no-store',
    });
  } catch {
    // The next plan will try again.
  }
}

/**
 * Plays a planned run, in order, to the end.
 *
 * There is no timer that stops audio and no seek anywhere in this component: a
 * file that starts plays until it finishes, which is what keeps a recitation
 * from stopping between two ayat. Everything that could shorten it was decided
 * before the first file sounded, in the plan the server handed over.
 *
 * A reload resumes the same run at the file that had not finished yet, from
 * its first second - never from a position inside a recitation.
 */
export function RecitationPlayer() {
  const [broadcast, setBroadcast] = useState<RecitationBroadcast>({ active: false, label: '' });
  const [audioBlocked, setAudioBlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const gapTimeoutRef = useRef<number | null>(null);
  const playErrorCountRef = useRef(0);
  const currentIndexRef = useRef(0);
  const runKeyRef = useRef('');
  const plannedRef = useRef<PlannedRecitation[]>([]);
  const gapSecRef = useRef(15);
  const deadlineRef = useRef(0);
  const overrunRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const clearGapTimer = useCallback(() => {
    if (gapTimeoutRef.current !== null) {
      window.clearTimeout(gapTimeoutRef.current);
      gapTimeoutRef.current = null;
    }
  }, []);

  const stopCurrentAudio = useCallback(() => {
    clearGapTimer();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [clearGapTimer]);

  const finishRun = useCallback(() => {
    clearProgress();
    void reportProgress(runKeyRef.current, overrunRef.current ? 'overrun' : 'done');
    overrunRef.current = false;
  }, []);

  /**
   * Play the planned file at `index`, then the next one after the slot's gap.
   * Re-entrant by design: the unlock retry calls it again, and it rebuilds the
   * element from the start rather than resuming a position.
   */
  const playFrom = useCallback(
    (index: number) => {
      const planned = plannedRef.current;
      const runKey = runKeyRef.current;

      if (!runKey || index >= planned.length) {
        stopCurrentAudio();
        finishRun();
        return;
      }

      const entry = planned[index];
      currentIndexRef.current = index;
      writeProgress({ runKey, index });

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(entry.url);
      audio.preload = 'auto';
      audio.setAttribute('playsinline', 'true');
      audioRef.current = audio;

      audio.addEventListener(
        'ended',
        () => {
          if (audioRef.current !== audio) return;
          clearGapTimer();
          gapTimeoutRef.current = window.setTimeout(
            () => {
              gapTimeoutRef.current = null;
              playFrom(index + 1);
            },
            Math.max(0, gapSecRef.current) * 1000,
          );
        },
        { once: true },
      );

      // The real length can disagree with the stored one. Playing on is the safe
      // direction; the disagreement is reported so the console can say so.
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

          const actualMs = Math.round(audio.duration * 1000);
          if (Math.abs(actualMs - entry.durationMs) > 1000) {
            void reportDuration(entry.url, actualMs);
          }
          if (deadlineRef.current > 0 && Date.now() + actualMs > deadlineRef.current) {
            overrunRef.current = true;
          }
        },
        { once: true },
      );

      audio.addEventListener(
        'error',
        () => {
          if (audioRef.current !== audio) return;
          audioRef.current = null;
          playErrorCountRef.current += 1;
          if (playErrorCountRef.current > MAX_PLAY_ERRORS) {
            // An unreadable file is skipped, never left half-played.
            playFrom(index + 1);
            return;
          }
          clearRetryTimer();
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null;
            playFrom(index);
          }, RETRY_DELAY_MS);
        },
        { once: true },
      );

      try {
        const attempt = audio.play();
        if (attempt && typeof attempt.then === 'function') {
          void attempt
            .then(() => {
              if (audioRef.current !== audio) return;
              playErrorCountRef.current = 0;
              setAudioBlocked(false);
              void reportProgress(runKey, 'running');
            })
            .catch(() => {
              if (audioRef.current !== audio) return;
              // Chrome on the TV blocks playback until someone touches it.
              setAudioBlocked(true);
              clearRetryTimer();
              retryTimeoutRef.current = window.setTimeout(() => {
                retryTimeoutRef.current = null;
                playFrom(index);
              }, RETRY_DELAY_MS);
            });
          return;
        }
        setAudioBlocked(false);
      } catch {
        setAudioBlocked(true);
      }
    },
    [clearGapTimer, clearRetryTimer, finishRun, stopCurrentAudio],
  );

  const startRun = useCallback(
    (payload: StatePayload) => {
      const run = payload.run;
      const planned = payload.plan?.planned ?? [];
      if (!run || !planned.length) return;
      if (SETTLED_STATUSES.has(run.status)) return;
      if (runKeyRef.current === run.runKey) return;

      const saved = readProgress();
      const resumeIndex = saved && saved.runKey === run.runKey ? saved.index : 0;

      runKeyRef.current = run.runKey;
      plannedRef.current = planned;
      gapSecRef.current = Number.isFinite(payload.gapSec) ? Number(payload.gapSec) : 15;
      deadlineRef.current = run.deadlineIso ? Date.parse(run.deadlineIso) : 0;
      overrunRef.current = false;
      currentIndexRef.current = 0;
      playErrorCountRef.current = 0;

      setBroadcast({ active: true, label: run.slotLabel });

      // A reload lands here with the same run key: continue at the file that
      // had not finished, from its first second.
      playFrom(Math.max(0, Math.min(resumeIndex, planned.length - 1)));
    },
    [playFrom],
  );

  const endRun = useCallback(() => {
    runKeyRef.current = '';
    plannedRef.current = [];
    currentIndexRef.current = 0;
    stopCurrentAudio();
    setAudioBlocked(false);
    setBroadcast({ active: false, label: '' });
  }, [stopCurrentAudio]);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const response = await fetch('/api/recitation/state', { cache: 'no-store' });
        if (!response.ok || !mounted) return;

        const payload = (await response.json()) as StatePayload;
        const run = payload.run;
        const due = Boolean(run) && (payload.plan?.planned.length ?? 0) > 0;

        if (!due) {
          // Stand down only when this tab is not mid-run, so a poll landing
          // between two files cannot silence the recitation.
          if (runKeyRef.current) endRun();
          return;
        }

        if (SETTLED_STATUSES.has(run?.status ?? '')) {
          if (runKeyRef.current === run?.runKey) endRun();
          return;
        }

        startRun(payload);
      } catch {
        // Keep the current state; the next poll tries again.
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [endRun, startRun]);

  useEffect(() => {
    announceRecitationActive(broadcast);
    document.documentElement.classList.toggle('recitation-active', broadcast.active);

    return () => {
      document.documentElement.classList.remove('recitation-active');
    };
  }, [broadcast]);

  useEffect(() => {
    const markUnlocked = () => window.localStorage.setItem(AUDIO_UNLOCKED_KEY, '1');
    window.addEventListener('pointerdown', markUnlocked, { passive: true });
    window.addEventListener('keydown', markUnlocked);
    window.addEventListener('touchstart', markUnlocked, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', markUnlocked);
      window.removeEventListener('keydown', markUnlocked);
      window.removeEventListener('touchstart', markUnlocked);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearRetryTimer();
      clearGapTimer();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [clearGapTimer, clearRetryTimer]);

  if (!broadcast.active) return null;

  return (
    <div className="recitation-bar" role="status">
      <span className="recitation-bar__dot" aria-hidden="true" />
      <span className="recitation-bar__label">{broadcast.label}</span>
      {audioBlocked ? <span className="recitation-bar__unlock">Tap to enable audio</span> : null}
    </div>
  );
}
