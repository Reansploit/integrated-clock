import { NextRequest, NextResponse } from 'next/server';

import { isAuthorizedAnnouncementToken, relayAnnouncementSignal } from '@/lib/announcement/serverStore';

export const runtime = 'nodejs';

type SignalKind = 'offer' | 'answer' | 'ice';
type SignalFrom = 'admin' | 'viewer';

function isSignalKind(value: unknown): value is SignalKind {
  return value === 'offer' || value === 'answer' || value === 'ice';
}

function isSignalFrom(value: unknown): value is SignalFrom {
  return value === 'admin' || value === 'viewer';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const from = body.from;
  const kind = body.kind;
  const viewerId = String(body.viewerId || '').trim();
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
  const sdp = typeof body.sdp === 'string' ? body.sdp : undefined;
  const candidate = body.candidate;

  if (!isSignalFrom(from)) {
    return NextResponse.json({ error: 'Invalid from' }, { status: 400 });
  }

  if (!isSignalKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  if (!viewerId) {
    return NextResponse.json({ error: 'viewerId is required' }, { status: 400 });
  }

  if (from === 'admin') {
    const token = body.token;
    if (!isAuthorizedAnnouncementToken(token)) {
      return NextResponse.json({ error: 'Unauthorized token' }, { status: 401 });
    }
  }

  const result = relayAnnouncementSignal({
    sessionId,
    viewerId,
    kind,
    from,
    sdp,
    candidate,
  });

  if (!result.ok) {
    const status =
      result.reason === 'no_active_session' || result.reason === 'session_mismatch' || result.reason === 'viewer_not_found'
        ? 409
        : 400;
    return NextResponse.json({ error: 'Signal rejected', reason: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, sessionId: result.sessionId });
}
