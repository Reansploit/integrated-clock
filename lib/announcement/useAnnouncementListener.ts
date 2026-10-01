'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { buildAnnouncementUrl } from '@/lib/announcement/apiBase';
import { playAnnouncementSignal, primeAnnouncementSignal } from '@/lib/announcement/playAnnouncementSignal';
import { getAnnouncementRtcConfiguration } from '@/lib/announcement/rtcConfig';

type AnnouncementListenerOptions = {
  streamUrl: string;
};

type SessionStartPayload = {
  sessionId?: string;
};

type SessionStopPayload = {
  sessionId?: string;
};

type SignalPayload = {
  sessionId?: string;
  viewerId?: string;
  kind?: 'offer' | 'answer' | 'ice';
  from?: 'admin' | 'viewer';
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
};

const RTC_CONFIGURATION = getAnnouncementRtcConfiguration();

function createViewerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `viewer-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createAudioElement() {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', 'true');
  audio.preload = 'auto';
  audio.muted = false;
  audio.volume = 1.0;
  audio.style.position = 'fixed';
  audio.style.left = '-9999px';
  audio.style.top = '-9999px';
  audio.style.width = '1px';
  audio.style.height = '1px';
  audio.style.opacity = '0.01';
  document.body.appendChild(audio);
  return audio;
}

async function postJson(path: string, body: Record<string, unknown>, keepalive = false) {
  const response = await fetch(buildAnnouncementUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    keepalive,
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    const message = String(json.error || json.reason || 'Request failed');
    throw new Error(message);
  }

  return response.json().catch(() => ({}));
}

export function useAnnouncementListener(options: AnnouncementListenerOptions) {
  const streamUrl = useMemo(() => options.streamUrl.trim(), [options.streamUrl]);
  const [isLive, setIsLive] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [peerState, setPeerState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');

  const eventSourceRef = useRef<EventSource | null>(null);
  const viewerIdRef = useRef('');
  const activeSessionIdRef = useRef<string | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const audioPlayPendingRef = useRef(false);
  const hideTimeoutRef = useRef<number | null>(null);

  const closePeer = () => {
    pendingIceRef.current = [];

    const peer = peerRef.current;
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      try {
        peer.close();
      } catch {
        // noop
      }
    }

    peerRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      try {
        audioRef.current.srcObject = null;
      } catch {
        // noop
      }
      audioRef.current.src = '';
    }
    remoteStreamRef.current = null;
    setPeerState('idle');
  };

  const ensureAudioElement = () => {
    const current = audioRef.current || createAudioElement();
    audioRef.current = current;
    return current;
  };

  const sendViewerSignal = async (payload: { kind: 'answer' | 'ice'; sdp?: string; candidate?: unknown }) => {
    const viewerId = viewerIdRef.current;
    const sessionId = activeSessionIdRef.current;

    if (!viewerId || !sessionId) {
      return;
    }

    await postJson('/api/announcement/session/signal', {
      from: 'viewer',
      sessionId,
      viewerId,
      kind: payload.kind,
      sdp: payload.sdp,
      candidate: payload.candidate,
    });
  };

  const flushPendingIce = async (peer: RTCPeerConnection) => {
    const pending = pendingIceRef.current;
    if (!pending.length) {
      return;
    }

    pendingIceRef.current = [];
    for (const candidate of pending) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // noop
      }
    }
  };

  const createPeer = () => {
    closePeer();

    const peer = new RTCPeerConnection(RTC_CONFIGURATION);
    peerRef.current = peer;
    setPeerState('connecting');

    peer.onicecandidate = (event) => {
      const payload = event.candidate ? event.candidate.toJSON() : null;
      void sendViewerSignal({
        kind: 'ice',
        candidate: payload,
      }).catch(() => undefined);
    };

    peer.ontrack = (event) => {
      const audioElement = ensureAudioElement();
      const incomingStream = event.streams[0];

      if (incomingStream) {
        remoteStreamRef.current = incomingStream;
      } else {
        const fallbackStream = remoteStreamRef.current || new MediaStream();
        remoteStreamRef.current = fallbackStream;
        // Some browsers deliver streamless tracks; attach track manually.
        if (!fallbackStream.getTracks().some((track) => track.id === event.track.id)) {
          fallbackStream.addTrack(event.track);
        }
      }

      const streamToPlay = remoteStreamRef.current;
      if (!streamToPlay) {
        return;
      }

      audioElement.srcObject = streamToPlay;
      void audioElement.play().then(() => {
        audioPlayPendingRef.current = false;
        setAudioBlocked(false);
      }).catch(() => {
        audioPlayPendingRef.current = true;
        setAudioBlocked(true);
      });
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setPeerState('connected');
      }

      if (
        peer.connectionState === 'failed' ||
        peer.connectionState === 'disconnected' ||
        peer.connectionState === 'closed'
      ) {
        setPeerState('failed');
        closePeer();
      }
    };

    return peer;
  };

  useEffect(() => {
    if (!streamUrl || typeof window === 'undefined') {
      return;
    }

    viewerIdRef.current = createViewerId();
    const viewerId = viewerIdRef.current;

    const unlock = () => {
      primeAnnouncementSignal();
      if (audioPlayPendingRef.current && audioRef.current) {
        void audioRef.current.play().then(() => {
          audioPlayPendingRef.current = false;
          setAudioBlocked(false);
        }).catch(() => undefined);
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });

    const streamEndpoint = buildAnnouncementUrl(streamUrl);
    const source = new EventSource(`${streamEndpoint}?role=viewer&viewerId=${encodeURIComponent(viewerId)}`);
    eventSourceRef.current = source;

    const handleSessionStart = (event: MessageEvent<string>) => {
      let payload: SessionStartPayload = {};
      try {
        payload = JSON.parse(event.data) as SessionStartPayload;
      } catch {
        payload = {};
      }

      const sessionId = String(payload.sessionId || '').trim();
      if (!sessionId) {
        return;
      }

      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }

      activeSessionIdRef.current = sessionId;
      setIsLive(true);
      setAnnouncementText(
        `Live announcement dimulai pada ${new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}.`
      );
      playAnnouncementSignal();

      void postJson('/api/announcement/session/join', { viewerId }).catch(() => undefined);
    };

    const handleSessionStop = (event: MessageEvent<string>) => {
      let payload: SessionStopPayload = {};
      try {
        payload = JSON.parse(event.data) as SessionStopPayload;
      } catch {
        payload = {};
      }

      if (payload.sessionId && activeSessionIdRef.current && payload.sessionId !== activeSessionIdRef.current) {
        return;
      }

      activeSessionIdRef.current = null;
      playAnnouncementSignal();
      setAnnouncementText(
        `Live announcement selesai pada ${new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}.`
      );

      closePeer();
      hideTimeoutRef.current = window.setTimeout(() => {
        setIsLive(false);
        setAudioBlocked(false);
        setPeerState('idle');
      }, 450);
    };

    const handleSignal = (event: MessageEvent<string>) => {
      let payload: SignalPayload = {};
      try {
        payload = JSON.parse(event.data) as SignalPayload;
      } catch {
        payload = {};
      }

      if (payload.from !== 'admin') {
        return;
      }

      const viewerTarget = String(payload.viewerId || '').trim();
      if (!viewerTarget || viewerTarget !== viewerIdRef.current) {
        return;
      }

      const activeSessionId = activeSessionIdRef.current;
      if (!activeSessionId || payload.sessionId !== activeSessionId) {
        return;
      }

      if (payload.kind === 'offer') {
        const sdp = String(payload.sdp || '');
        if (!sdp) {
          return;
        }

        const peer = createPeer();

        void (async () => {
          try {
            await peer.setRemoteDescription({ type: 'offer', sdp });
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sendViewerSignal({
              kind: 'answer',
              sdp: answer.sdp || '',
            });
            await flushPendingIce(peer);
          } catch {
            closePeer();
          }
        })();

        return;
      }

      if (payload.kind === 'ice') {
        const candidate = payload.candidate;
        const peer = peerRef.current;

        if (!peer || !peer.remoteDescription) {
          if (candidate && typeof candidate === 'object') {
            pendingIceRef.current.push(candidate as RTCIceCandidateInit);
          }
          return;
        }

        void peer.addIceCandidate((candidate as RTCIceCandidateInit | null) ?? null).catch(() => undefined);
      }
    };

    source.addEventListener('session_start', handleSessionStart as EventListener);
    source.addEventListener('session_stop', handleSessionStop as EventListener);
    source.addEventListener('signal', handleSignal as EventListener);

    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }

      source.removeEventListener('session_start', handleSessionStart as EventListener);
      source.removeEventListener('session_stop', handleSessionStop as EventListener);
      source.removeEventListener('signal', handleSignal as EventListener);
      source.close();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);

      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }

      const currentViewerId = viewerIdRef.current;
      if (currentViewerId) {
        void postJson('/api/announcement/session/leave', { viewerId: currentViewerId }, true).catch(() => undefined);
      }

      closePeer();
      activeSessionIdRef.current = null;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        try {
          audioRef.current.srcObject = null;
        } catch {
          // noop
        }
        if (audioRef.current.parentNode) {
          audioRef.current.parentNode.removeChild(audioRef.current);
        }
      }
      audioRef.current = null;
    };
  }, [streamUrl]);

  function retryAudioPlayback() {
    if (!audioRef.current) {
      return;
    }

    void audioRef.current.play().then(() => {
      audioPlayPendingRef.current = false;
      setAudioBlocked(false);
    }).catch(() => {
      audioPlayPendingRef.current = true;
      setAudioBlocked(true);
    });
  }

  return {
    isLive,
    announcementText,
    audioBlocked,
    retryAudioPlayback,
    peerState,
  };
}
