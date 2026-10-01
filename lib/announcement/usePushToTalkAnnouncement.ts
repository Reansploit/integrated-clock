'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildAnnouncementUrl } from '@/lib/announcement/apiBase';
import { playAnnouncementSignal, primeAnnouncementSignal } from '@/lib/announcement/playAnnouncementSignal';
import { getAnnouncementRtcConfiguration } from '@/lib/announcement/rtcConfig';

type PushToTalkOptions = {
  authToken?: string;
};

type PushToTalkState = {
  isConnected: boolean;
  isActive: boolean;
  micDenied: boolean;
  error: string;
};

type SignalEventPayload = {
  sessionId?: string;
  viewerId?: string;
  kind?: 'offer' | 'answer' | 'ice';
  from?: 'admin' | 'viewer';
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
};

const RTC_CONFIGURATION = getAnnouncementRtcConfiguration();

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || element.isContentEditable;
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(buildAnnouncementUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(json.error || json.reason || 'Request failed');
    throw new Error(message);
  }

  return json as Record<string, unknown>;
}

export function usePushToTalkAnnouncement(options: PushToTalkOptions): PushToTalkState {
  const { authToken = '' } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [error, setError] = useState('');

  const eventSourceRef = useRef<EventSource | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pressedRef = useRef(false);
  const aliveRef = useRef(true);
  const stoppingRef = useRef(false);

  const sendSignal = useCallback(
    async (payload: { viewerId: string; kind: 'offer' | 'answer' | 'ice'; sdp?: string; candidate?: unknown }) => {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId) {
        return;
      }

      await postJson('/api/announcement/session/signal', {
        token: authToken,
        sessionId: activeSessionId,
        from: 'admin',
        viewerId: payload.viewerId,
        kind: payload.kind,
        sdp: payload.sdp,
        candidate: payload.candidate,
      });
    },
    [authToken]
  );

  const closePeerForViewer = useCallback((viewerId: string) => {
    const existing = peerConnectionsRef.current.get(viewerId);
    if (!existing) {
      return;
    }

    existing.onicecandidate = null;
    existing.onconnectionstatechange = null;
    existing.ontrack = null;

    try {
      existing.close();
    } catch {
      // noop
    }

    peerConnectionsRef.current.delete(viewerId);
    pendingIceRef.current.delete(viewerId);
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const viewerId of peerConnectionsRef.current.keys()) {
      closePeerForViewer(viewerId);
    }
    peerConnectionsRef.current.clear();
    pendingIceRef.current.clear();
  }, [closePeerForViewer]);

  const createPeerForViewer = useCallback(
    async (viewerId: string) => {
      if (!viewerId || !sessionIdRef.current) {
        return;
      }

      const localStream = localStreamRef.current;
      if (!localStream) {
        return;
      }

      closePeerForViewer(viewerId);

      const peer = new RTCPeerConnection(RTC_CONFIGURATION);
      peerConnectionsRef.current.set(viewerId, peer);

      for (const track of localStream.getTracks()) {
        peer.addTrack(track, localStream);
      }

      peer.onicecandidate = (event) => {
        const candidatePayload = event.candidate ? event.candidate.toJSON() : null;
        void sendSignal({
          viewerId,
          kind: 'ice',
          candidate: candidatePayload,
        }).catch(() => undefined);
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
          closePeerForViewer(viewerId);
        }
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await sendSignal({
          viewerId,
          kind: 'offer',
          sdp: offer.sdp || '',
        });
      } catch (caught) {
        setError(String((caught as Error)?.message || 'WebRTC offer failed'));
        closePeerForViewer(viewerId);
      }
    },
    [closePeerForViewer, sendSignal]
  );

  const applyPendingIce = useCallback(async (viewerId: string, peer: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(viewerId) || [];
    if (!pending.length) {
      return;
    }

    pendingIceRef.current.delete(viewerId);
    for (const candidate of pending) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // noop
      }
    }
  }, []);

  const handleSignalFromViewer = useCallback(
    async (payload: SignalEventPayload) => {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId || payload.sessionId !== activeSessionId) {
        return;
      }

      const viewerId = String(payload.viewerId || '').trim();
      if (!viewerId) {
        return;
      }

      if (payload.kind === 'answer') {
        const sdp = String(payload.sdp || '');
        if (!sdp) {
          return;
        }

        const peer = peerConnectionsRef.current.get(viewerId);
        if (!peer) {
          return;
        }

        try {
          await peer.setRemoteDescription({ type: 'answer', sdp });
          await applyPendingIce(viewerId, peer);
        } catch {
          closePeerForViewer(viewerId);
        }
        return;
      }

      if (payload.kind === 'ice') {
        const candidate = payload.candidate || null;
        const peer = peerConnectionsRef.current.get(viewerId);

        if (!peer || !peer.remoteDescription) {
          if (candidate && typeof candidate === 'object') {
            const queue = pendingIceRef.current.get(viewerId) || [];
            queue.push(candidate as RTCIceCandidateInit);
            pendingIceRef.current.set(viewerId, queue);
          }
          return;
        }

        try {
          await peer.addIceCandidate(candidate as RTCIceCandidateInit | null);
        } catch {
          // noop
        }
      }
    },
    [applyPendingIce, closePeerForViewer]
  );

  const stopStreaming = useCallback(async () => {
    if (stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;

    try {
      closeAllPeers();

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          track.stop();
        }
      }
      localStreamRef.current = null;

      const activeSessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      setIsActive(false);

      if (activeSessionId) {
        await postJson('/api/announcement/session/stop', {
          token: authToken,
          sessionId: activeSessionId,
        });
      }
    } catch {
      // noop
    } finally {
      stoppingRef.current = false;
    }
  }, [authToken, closeAllPeers]);

  const startStreaming = useCallback(async () => {
    if (isActive || stoppingRef.current) {
      return;
    }

    try {
      setError('');
      const stream = await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        })
        .catch((caught) => {
          setMicDenied(true);
          throw caught;
        });

      localStreamRef.current = stream;

      const startResult = await postJson('/api/announcement/session/start', {
        token: authToken,
        mimeType: 'audio/webrtc',
      });

      sessionIdRef.current = String(startResult.sessionId || '');
      setMicDenied(false);
      setIsActive(true);
      playAnnouncementSignal();
    } catch (caught) {
      const message = String((caught as Error)?.message || 'Mic permission denied');
      setError(message);
      void stopStreaming();
    }
  }, [authToken, isActive, stopStreaming]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    aliveRef.current = true;

    const source = new EventSource(buildAnnouncementUrl('/api/announcement/stream?role=admin'));
    eventSourceRef.current = source;

    source.onopen = () => {
      if (!aliveRef.current) return;
      setIsConnected(true);
      setError('');
    };

    source.onerror = () => {
      if (!aliveRef.current) return;
      setIsConnected(false);
    };

    const handleViewerJoined = (event: MessageEvent<string>) => {
      let payload: { viewerId?: string; sessionId?: string } = {};
      try {
        payload = JSON.parse(event.data) as { viewerId?: string; sessionId?: string };
      } catch {
        payload = {};
      }

      if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) {
        return;
      }

      const viewerId = String(payload.viewerId || '').trim();
      if (!viewerId) {
        return;
      }

      void createPeerForViewer(viewerId).catch(() => undefined);
    };

    const handleViewerLeft = (event: MessageEvent<string>) => {
      let payload: { viewerId?: string } = {};
      try {
        payload = JSON.parse(event.data) as { viewerId?: string };
      } catch {
        payload = {};
      }

      const viewerId = String(payload.viewerId || '').trim();
      if (!viewerId) {
        return;
      }

      closePeerForViewer(viewerId);
    };

    const handleSignal = (event: MessageEvent<string>) => {
      let payload: SignalEventPayload = {};
      try {
        payload = JSON.parse(event.data) as SignalEventPayload;
      } catch {
        payload = {};
      }

      if (payload.from !== 'viewer') {
        return;
      }

      void handleSignalFromViewer(payload);
    };

    const handleSessionStop = () => {
      closeAllPeers();
      sessionIdRef.current = null;
      setIsActive(false);
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          track.stop();
        }
        localStreamRef.current = null;
      }
    };

    source.addEventListener('viewer_joined', handleViewerJoined as EventListener);
    source.addEventListener('viewer_left', handleViewerLeft as EventListener);
    source.addEventListener('signal', handleSignal as EventListener);
    source.addEventListener('session_stop', handleSessionStop as EventListener);

    const unlock = () => {
      primeAnnouncementSignal();
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });

    return () => {
      aliveRef.current = false;
      source.removeEventListener('viewer_joined', handleViewerJoined as EventListener);
      source.removeEventListener('viewer_left', handleViewerLeft as EventListener);
      source.removeEventListener('signal', handleSignal as EventListener);
      source.removeEventListener('session_stop', handleSessionStop as EventListener);
      source.close();

      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }

      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);

      void stopStreaming();
    };
  }, [closeAllPeers, closePeerForViewer, createPeerForViewer, handleSignalFromViewer, stopStreaming]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (pressedRef.current) return;
      pressedRef.current = true;
      playAnnouncementSignal();
      void startStreaming();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      pressedRef.current = false;
      playAnnouncementSignal();
      void stopStreaming();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startStreaming, stopStreaming]);

  return {
    isConnected,
    isActive,
    micDenied,
    error,
  };
}
