import 'server-only';

import { createHash, randomUUID, timingSafeEqual } from 'crypto';

type AnnouncementEventName =
  | 'session_start'
  | 'session_stop'
  | 'viewer_joined'
  | 'viewer_left'
  | 'signal'
  | 'heartbeat';

type AnnouncementRole = 'admin' | 'viewer' | 'public';

type SignalKind = 'offer' | 'answer' | 'ice';

type SignalFrom = 'admin' | 'viewer';

type AnnouncementSubscriber = {
  id: string;
  role: AnnouncementRole;
  viewerId: string | null;
  push: (eventName: AnnouncementEventName, payload: Record<string, unknown>) => void;
};

type ViewerState = {
  joinedAt: number;
};

type AnnouncementSession = {
  active: boolean;
  sessionId: string | null;
  mimeType: string;
  startedAt: number;
};

type AnnouncementStore = {
  session: AnnouncementSession;
  viewers: Map<string, ViewerState>;
  subscribers: Set<AnnouncementSubscriber>;
  subscriberCounter: number;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  sweepTimer: ReturnType<typeof setInterval> | null;
};

type AnnouncementSnapshot = {
  active: boolean;
  sessionId: string | null;
  mimeType: string;
  startedAt: number;
  viewerCount: number;
};

type RelaySignalInput = {
  sessionId?: string;
  viewerId: string;
  kind: SignalKind;
  from: SignalFrom;
  sdp?: string;
  candidate?: unknown;
};

type SubscribeAnnouncementInput = {
  role?: AnnouncementRole;
  viewerId?: string;
};

const HEARTBEAT_MS = 3_000;
const SWEEP_MS = 5_000;

const globalKey = '__announcementStoreWebRtcV1__';

function createStore(): AnnouncementStore {
  return {
    session: {
      active: false,
      sessionId: null,
      mimeType: 'audio/webm;codecs=opus',
      startedAt: 0,
    },
    viewers: new Map<string, ViewerState>(),
    subscribers: new Set<AnnouncementSubscriber>(),
    subscriberCounter: 0,
    heartbeatTimer: null,
    sweepTimer: null,
  };
}

function getStore(): AnnouncementStore {
  const registry = globalThis as unknown as Record<string, AnnouncementStore | undefined>;
  if (!registry[globalKey]) {
    registry[globalKey] = createStore();
  }
  return registry[globalKey]!;
}

function safePush(
  subscriber: AnnouncementSubscriber,
  eventName: AnnouncementEventName,
  payload: Record<string, unknown>
) {
  try {
    subscriber.push(eventName, payload);
  } catch {
    // Stream teardown will clean up dead subscribers.
  }
}

function forEachSubscriber(push: (subscriber: AnnouncementSubscriber) => void) {
  const store = getStore();
  for (const subscriber of store.subscribers) {
    push(subscriber);
  }
}

function broadcast(eventName: AnnouncementEventName, payload: Record<string, unknown>) {
  forEachSubscriber((subscriber) => {
    safePush(subscriber, eventName, payload);
  });
}

function broadcastToAdmins(eventName: AnnouncementEventName, payload: Record<string, unknown>) {
  forEachSubscriber((subscriber) => {
    if (subscriber.role !== 'admin') {
      return;
    }
    safePush(subscriber, eventName, payload);
  });
}

function broadcastToViewer(viewerId: string, eventName: AnnouncementEventName, payload: Record<string, unknown>) {
  forEachSubscriber((subscriber) => {
    if (subscriber.role !== 'viewer' || subscriber.viewerId !== viewerId) {
      return;
    }
    safePush(subscriber, eventName, payload);
  });
}

function resetSession() {
  const store = getStore();
  store.session.active = false;
  store.session.sessionId = null;
  store.session.mimeType = 'audio/webm;codecs=opus';
  store.session.startedAt = 0;
  store.viewers.clear();
}

function hasAdminSubscriber() {
  let found = false;
  forEachSubscriber((subscriber) => {
    if (subscriber.role === 'admin') {
      found = true;
    }
  });
  return found;
}

function upsertViewer(viewerId: string) {
  const store = getStore();
  const previous = store.viewers.get(viewerId);
  const now = Date.now();

  if (previous) {
    previous.joinedAt = now;
    store.viewers.set(viewerId, previous);
    return { created: false };
  }

  store.viewers.set(viewerId, {
    joinedAt: now,
  });
  return { created: true };
}

function removeViewer(viewerId: string) {
  const store = getStore();
  return store.viewers.delete(viewerId);
}

function ensureTimers() {
  const store = getStore();

  if (!store.heartbeatTimer) {
    store.heartbeatTimer = setInterval(() => {
      const session = getStore().session;
      broadcast('heartbeat', {
        ts: Date.now(),
        active: session.active,
        sessionId: session.sessionId,
      });
    }, HEARTBEAT_MS);
  }

  if (!store.sweepTimer) {
    store.sweepTimer = setInterval(() => {
      const latest = getStore();
      const session = latest.session;

      if (!session.active || !session.sessionId) {
        return;
      }

      if (!hasAdminSubscriber()) {
        stopAnnouncementSession(session.sessionId, 'admin_disconnected');
        return;
      }

    }, SWEEP_MS);
  }
}

export function isAuthorizedAnnouncementToken(inputToken: unknown): boolean {
  const adminToken = process.env.ANNOUNCEMENT_ADMIN_TOKEN || '';
  if (!adminToken) {
    return true;
  }

  const incoming = String(inputToken || '');
  const hashIncoming = createHash('sha256').update(incoming).digest();
  const hashExpected = createHash('sha256').update(adminToken).digest();
  if (hashIncoming.length !== hashExpected.length) {
    return false;
  }
  return timingSafeEqual(hashIncoming, hashExpected);
}

export function getAnnouncementSnapshot(): AnnouncementSnapshot {
  const store = getStore();
  const session = store.session;
  return {
    active: session.active,
    sessionId: session.sessionId,
    mimeType: session.mimeType,
    startedAt: session.startedAt,
    viewerCount: store.viewers.size,
  };
}

export function startAnnouncementSession(mimeType: string) {
  ensureTimers();
  const store = getStore();

  if (store.session.active) {
    return {
      ok: false as const,
      reason: 'busy',
      snapshot: getAnnouncementSnapshot(),
    };
  }

  const nextSessionId = randomUUID();
  store.session.active = true;
  store.session.sessionId = nextSessionId;
  store.session.mimeType = mimeType || 'audio/webm;codecs=opus';
  store.session.startedAt = Date.now();
  store.viewers.clear();

  broadcast('session_start', {
    sessionId: store.session.sessionId,
    mimeType: store.session.mimeType,
    startedAt: store.session.startedAt,
  });

  return {
    ok: true as const,
    sessionId: store.session.sessionId,
    mimeType: store.session.mimeType,
  };
}

export function stopAnnouncementSession(
  sessionId?: string,
  reason: 'manual' | 'admin_disconnected' = 'manual'
) {
  const store = getStore();
  const session = store.session;

  if (!session.active || !session.sessionId) {
    return { ok: true as const, alreadyStopped: true as const };
  }

  if (sessionId && sessionId !== session.sessionId) {
    return { ok: false as const, reason: 'session_mismatch' };
  }

  const previousSessionId = session.sessionId;
  resetSession();
  broadcast('session_stop', { sessionId: previousSessionId, reason });
  return { ok: true as const };
}

export function joinAnnouncementViewer(viewerId: string) {
  const store = getStore();
  const session = store.session;

  if (!session.active || !session.sessionId) {
    return { ok: false as const, reason: 'no_active_session' };
  }

  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) {
    return { ok: false as const, reason: 'invalid_viewer_id' };
  }

  const { created } = upsertViewer(normalizedViewerId);
  if (created) {
    broadcastToAdmins('viewer_joined', {
      sessionId: session.sessionId,
      viewerId: normalizedViewerId,
      joinedAt: Date.now(),
    });
  }

  return {
    ok: true as const,
    sessionId: session.sessionId,
    mimeType: session.mimeType,
  };
}

export function leaveAnnouncementViewer(viewerId: string) {
  const store = getStore();
  const session = store.session;

  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) {
    return { ok: false as const, reason: 'invalid_viewer_id' };
  }

  const existed = removeViewer(normalizedViewerId);
  if (existed && session.active && session.sessionId) {
    broadcastToAdmins('viewer_left', {
      sessionId: session.sessionId,
      viewerId: normalizedViewerId,
      reason: 'leave',
    });
  }

  return { ok: true as const };
}

export function relayAnnouncementSignal(input: RelaySignalInput) {
  const store = getStore();
  const session = store.session;

  if (!session.active || !session.sessionId) {
    return { ok: false as const, reason: 'no_active_session' };
  }

  if (input.sessionId && input.sessionId !== session.sessionId) {
    return { ok: false as const, reason: 'session_mismatch' };
  }

  const viewerId = String(input.viewerId || '').trim();
  if (!viewerId) {
    return { ok: false as const, reason: 'invalid_viewer_id' };
  }

  if (!store.viewers.has(viewerId)) {
    return { ok: false as const, reason: 'viewer_not_found' };
  }

  if ((input.kind === 'offer' || input.kind === 'answer') && !String(input.sdp || '').trim()) {
    return { ok: false as const, reason: 'invalid_sdp' };
  }

  const payload: Record<string, unknown> = {
    sessionId: session.sessionId,
    viewerId,
    kind: input.kind,
    from: input.from,
  };

  if (input.kind === 'offer' || input.kind === 'answer') {
    payload.sdp = String(input.sdp || '');
  }

  if (input.kind === 'ice') {
    payload.candidate = input.candidate ?? null;
  }

  if (input.from === 'admin') {
    broadcastToViewer(viewerId, 'signal', payload);
  } else {
    broadcastToAdmins('signal', payload);
  }

  return { ok: true as const, sessionId: session.sessionId };
}

export function subscribeAnnouncementEvents(
  input: SubscribeAnnouncementInput,
  push: AnnouncementSubscriber['push']
) {
  ensureTimers();

  const role = input.role || 'public';
  const viewerId = input.viewerId ? String(input.viewerId).trim() : '';

  const store = getStore();
  const subscriber: AnnouncementSubscriber = {
    id: `sub-${++store.subscriberCounter}`,
    role,
    viewerId: role === 'viewer' && viewerId ? viewerId : null,
    push,
  };

  store.subscribers.add(subscriber);

  const session = store.session;
  if (session.active && session.sessionId) {
    safePush(subscriber, 'session_start', {
      sessionId: session.sessionId,
      mimeType: session.mimeType,
      startedAt: session.startedAt,
    });

    if (subscriber.role === 'admin') {
      for (const [currentViewerId, state] of store.viewers.entries()) {
        safePush(subscriber, 'viewer_joined', {
          sessionId: session.sessionId,
          viewerId: currentViewerId,
          joinedAt: state.joinedAt,
        });
      }
    }
  }

  safePush(subscriber, 'heartbeat', { ts: Date.now(), active: session.active, sessionId: session.sessionId });

  return () => {
    const latest = getStore();
    latest.subscribers.delete(subscriber);

    if (subscriber.role === 'viewer' && subscriber.viewerId) {
      const leaveResult = leaveAnnouncementViewer(subscriber.viewerId);
      if (!leaveResult.ok) {
        // noop
      }
    }
  };
}
