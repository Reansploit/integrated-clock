'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type MufrodatVideoOverlayProps = {
  src: string;
  playbackNonce: string;
};

type PlaybackStatePayload = {
  videoUrl?: string;
  playbackNonce?: string;
};

const PLAYED_NONCE_KEY = 'mufrodat-video-played-nonce';
const AUDIO_UNLOCKED_KEY = 'mufrodat-video-audio-unlocked';
const POLL_INTERVAL_MS = 10000;
const RETRY_DELAY_MS = 900;
const MAX_PLAYBACK_ERROR_RETRIES = 8;
const STALL_RECOVERY_DELAY_MS = 1400;
const MAX_STALL_RECOVERIES = 8;

function normalizeMediaUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function MufrodatVideoOverlay({ src, playbackNonce }: MufrodatVideoOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [activeNonce, setActiveNonce] = useState('');
  const [currentSrc, setCurrentSrc] = useState(() => normalizeMediaUrl(src));
  const [currentNonce, setCurrentNonce] = useState(() => playbackNonce.trim());
  const [retryToken, setRetryToken] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const acknowledgedNonceRef = useRef<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closingRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const stallRecoveryCountRef = useRef(0);
  const resumeTimeRef = useRef(0);
  const lastPlaybackTimeRef = useRef(0);
  const hasStartedPlaybackRef = useRef(false);
  const normalizedSrc = useMemo(() => normalizeMediaUrl(src), [src]);
  const playbackSrc = useMemo(() => {
    if (!currentSrc) {
      return '';
    }

    const queryParts: string[] = [];
    if (currentNonce) {
      queryParts.push(`nonce=${encodeURIComponent(currentNonce)}`);
    }
    if (retryToken > 0) {
      queryParts.push(`retry=${retryToken}`);
    }

    if (!queryParts.length) {
      return currentSrc;
    }

    const separator = currentSrc.includes('?') ? '&' : '?';
    return `${currentSrc}${separator}${queryParts.join('&')}`;
  }, [currentSrc, currentNonce, retryToken]);

  function tryUnmutePlayback() {
    const video = videoRef.current;
    if (!video || closingRef.current) {
      return;
    }

    video.muted = false;
    video.volume = 1;
    void video.play().catch(() => {
      video.muted = true;
    });
  }

  function clearRetryTimer() {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }

  function clearStallTimer() {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }

  useEffect(() => {
    setCurrentSrc(normalizedSrc);
  }, [normalizedSrc]);

  useEffect(() => {
    setCurrentNonce(playbackNonce.trim());
  }, [playbackNonce]);

  useEffect(() => {
    const unlocked = window.localStorage.getItem(AUDIO_UNLOCKED_KEY) === '1';
    if (unlocked) {
      setAudioUnlocked(true);
    }

    const markAudioUnlocked = () => {
      setAudioUnlocked(true);
      window.localStorage.setItem(AUDIO_UNLOCKED_KEY, '1');
      tryUnmutePlayback();
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
    let isMounted = true;

    const refreshPlaybackState = async () => {
      try {
        const response = await fetch('/api/mufrodat-video/state', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as PlaybackStatePayload;
        if (!isMounted) {
          return;
        }

        const nextSrc = normalizeMediaUrl(String(payload.videoUrl || ''));
        const nextNonce = String(payload.playbackNonce || '').trim();

        setCurrentSrc((previous) => (previous === nextSrc ? previous : nextSrc));
        setCurrentNonce((previous) => (previous === nextNonce ? previous : nextNonce));
      } catch {
        // Keep display silent if polling fails.
      }
    };

    if (visible) {
      return () => {
        isMounted = false;
      };
    }

    const intervalId = window.setInterval(refreshPlaybackState, POLL_INTERVAL_MS);
    void refreshPlaybackState();

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [visible]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('video-overlay-active', visible);
    return () => {
      root.classList.remove('video-overlay-active');
    };
  }, [visible]);

  useEffect(() => {
    if (!currentNonce || !currentSrc) {
      return;
    }

    const playedNonce = window.sessionStorage.getItem(PLAYED_NONCE_KEY) || '';
    if (playedNonce === currentNonce) {
      return;
    }

    setActiveNonce(currentNonce);
    closingRef.current = false;
    retryCountRef.current = 0;
    stallRecoveryCountRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    resumeTimeRef.current = 0;
    hasStartedPlaybackRef.current = false;
    clearRetryTimer();
    clearStallTimer();
    setRetryToken(0);
    setVisible(true);
  }, [currentNonce, currentSrc]);

  useEffect(() => {
    return () => {
      clearRetryTimer();
      clearStallTimer();
    };
  }, []);

  async function acknowledgeAndClose() {
    closingRef.current = true;
    clearRetryTimer();
    clearStallTimer();
    const nonce = activeNonce;
    if (!nonce) {
      setVisible(false);
      return;
    }

    if (acknowledgedNonceRef.current === nonce) {
      setVisible(false);
      return;
    }

    acknowledgedNonceRef.current = nonce;

    try {
      await fetch('/api/mufrodat-video/ack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playbackNonce: nonce }),
        cache: 'no-store',
      });
    } catch {
      // Intentionally silent on display UI.
    } finally {
      window.sessionStorage.setItem(PLAYED_NONCE_KEY, nonce);
      setVisible(false);
      setActiveNonce('');
      retryCountRef.current = 0;
      stallRecoveryCountRef.current = 0;
      lastPlaybackTimeRef.current = 0;
      resumeTimeRef.current = 0;
      hasStartedPlaybackRef.current = false;
      setRetryToken(0);
    }
  }

  function applyResumeTime(video: HTMLVideoElement) {
    const resumeTime = resumeTimeRef.current;
    if (resumeTime <= 0 || !Number.isFinite(resumeTime)) {
      return;
    }

    const maxSeekTarget = Number.isFinite(video.duration) && video.duration > 0 ? Math.max(video.duration - 0.1, 0) : resumeTime;
    const target = Math.max(0, Math.min(resumeTime, maxSeekTarget));
    if (target <= 0) {
      resumeTimeRef.current = 0;
      return;
    }

    try {
      video.currentTime = target;
    } catch {
      // Ignore seek failures on some browser states.
    } finally {
      resumeTimeRef.current = 0;
    }
  }

  function attemptPlayback() {
    const video = videoRef.current;
    if (!video || closingRef.current) {
      return;
    }
    applyResumeTime(video);
    void video.play().catch(() => undefined);
  }

  function handleVideoPause() {
    if (!visible || closingRef.current) {
      return;
    }
    const video = videoRef.current;
    if (!video || video.ended) {
      return;
    }
    attemptPlayback();
  }

  function handleVideoPlaying() {
    hasStartedPlaybackRef.current = true;
    retryCountRef.current = 0;
    stallRecoveryCountRef.current = 0;
    clearRetryTimer();
    clearStallTimer();
    if (audioUnlocked) {
      tryUnmutePlayback();
    }
  }

  function handleVideoError() {
    if (!visible || closingRef.current) {
      return;
    }

    retryCountRef.current += 1;
    const retryDelay = RETRY_DELAY_MS + Math.min(retryCountRef.current, MAX_PLAYBACK_ERROR_RETRIES) * 250;

    clearRetryTimer();
    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null;
      if (!visible || closingRef.current) {
        return;
      }
      setRetryToken((prev) => prev + 1);
      attemptPlayback();
    }, retryDelay);
  }

  function scheduleStallRecovery() {
    if (!visible || closingRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video || video.ended) {
      return;
    }

    // Ignore early buffering before playback really starts.
    // Otherwise slow-start videos can be treated as stalled too soon.
    if (!hasStartedPlaybackRef.current && lastPlaybackTimeRef.current <= 0) {
      return;
    }

    clearStallTimer();
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;
      if (!visible || closingRef.current) {
        return;
      }

      const activeVideo = videoRef.current;
      if (!activeVideo || activeVideo.ended) {
        return;
      }

      stallRecoveryCountRef.current += 1;
      if (stallRecoveryCountRef.current > MAX_STALL_RECOVERIES) {
        // Keep trying instead of closing early.
        // Some devices/network paths need multiple recoveries before stream stabilizes.
        stallRecoveryCountRef.current = MAX_STALL_RECOVERIES;
      }

      resumeTimeRef.current = Math.max(0, lastPlaybackTimeRef.current - 0.25);
      setRetryToken((prev) => prev + 1);
    }, STALL_RECOVERY_DELAY_MS);
  }

  function handleVideoTimeUpdate() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (Number.isFinite(video.currentTime) && video.currentTime >= 0) {
      lastPlaybackTimeRef.current = video.currentTime;
      if (video.currentTime > 0) {
        hasStartedPlaybackRef.current = true;
      }
    }
  }

  if (!visible || !currentSrc) {
    return null;
  }

  return (
    <div className="mufrodat-video-overlay" role="presentation" aria-hidden="true">
      <video
        key={`${activeNonce}-${currentSrc}-${retryToken}`}
        ref={videoRef}
        className="mufrodat-video-overlay__video"
        autoPlay
        playsInline
        muted={!audioUnlocked}
        preload="auto"
        controls={false}
        src={playbackSrc}
        onCanPlay={attemptPlayback}
        onLoadedMetadata={attemptPlayback}
        onPause={handleVideoPause}
        onPlaying={handleVideoPlaying}
        onWaiting={scheduleStallRecovery}
        onStalled={scheduleStallRecovery}
        onTimeUpdate={handleVideoTimeUpdate}
        onEnded={acknowledgeAndClose}
        onError={handleVideoError}
      />
    </div>
  );
}
