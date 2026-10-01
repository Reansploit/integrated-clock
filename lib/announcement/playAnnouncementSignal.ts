'use client';

const ANNOUNCEMENT_SIGNAL_URL = '/assets/audio/announcement/freesound_community-announcement-sound-104411.mp3';
let signalAudio: HTMLAudioElement | null = null;
let signalPrimed = false;

function getSignalAudioElement() {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!signalAudio) {
    signalAudio = new Audio(ANNOUNCEMENT_SIGNAL_URL);
    signalAudio.preload = 'auto';
  }
  return signalAudio;
}

export function primeAnnouncementSignal() {
  const audio = getSignalAudioElement();
  if (!audio || signalPrimed) {
    return;
  }

  try {
    audio.muted = true;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      void playPromise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          signalPrimed = true;
        })
        .catch(() => {
          audio.muted = false;
        });
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    signalPrimed = true;
  } catch {
    audio.muted = false;
  }
}

export function playAnnouncementSignal() {
  const audio = getSignalAudioElement();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // noop
  }
}
