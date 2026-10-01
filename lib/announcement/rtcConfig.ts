'use client';

type IceServerCandidate = {
  urls?: string | string[];
  username?: string;
  credential?: string;
};

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

function parseIceServersFromEnv(raw: string): RTCIceServer[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as IceServerCandidate[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => {
          if (!item || (!item.urls && !item.username && !item.credential)) {
            return null;
          }

          const urls = item.urls;
          if (!urls) {
            return null;
          }

          return {
            urls,
            username: item.username,
            credential: item.credential,
          } as RTCIceServer;
        })
        .filter((value): value is RTCIceServer => Boolean(value));
    } catch {
      return [];
    }
  }

  const urls = trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!urls.length) {
    return [];
  }

  return [{ urls }];
}

export function getAnnouncementRtcConfiguration(): RTCConfiguration {
  const envValue = process.env.NEXT_PUBLIC_ANNOUNCEMENT_ICE_SERVERS || '';
  const envServers = parseIceServersFromEnv(envValue);
  const iceServers = envServers.length ? envServers : DEFAULT_ICE_SERVERS;

  const hasTurn = iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((value) => String(value || '').startsWith('turn:') || String(value || '').startsWith('turns:'));
  });

  const transportRaw = (process.env.NEXT_PUBLIC_ANNOUNCEMENT_ICE_TRANSPORT_POLICY || '').trim().toLowerCase();
  const wantsRelay = transportRaw === 'relay';
  // Guard rail: relay without TURN results in zero usable candidates.
  const iceTransportPolicy: RTCIceTransportPolicy = wantsRelay && hasTurn ? 'relay' : 'all';

  return {
    iceServers,
    iceTransportPolicy,
    iceCandidatePoolSize: 8,
  };
}

export function getAnnouncementRtcDiagnostics() {
  const envValue = process.env.NEXT_PUBLIC_ANNOUNCEMENT_ICE_SERVERS || '';
  const envServers = parseIceServersFromEnv(envValue);
  const effectiveServers = envServers.length ? envServers : DEFAULT_ICE_SERVERS;

  const hasTurn = effectiveServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((value) => String(value || '').startsWith('turn:') || String(value || '').startsWith('turns:'));
  });

  const transportRaw = (process.env.NEXT_PUBLIC_ANNOUNCEMENT_ICE_TRANSPORT_POLICY || '').trim().toLowerCase();
  const iceTransportPolicy: RTCIceTransportPolicy = transportRaw === 'relay' ? 'relay' : 'all';

  return {
    hasTurn,
    iceTransportPolicy,
  };
}
