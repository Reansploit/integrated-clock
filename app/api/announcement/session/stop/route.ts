import { NextRequest, NextResponse } from 'next/server';

import { isAuthorizedAnnouncementToken, stopAnnouncementSession } from '@/lib/announcement/serverStore';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = body.token;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;

  if (!isAuthorizedAnnouncementToken(token)) {
    return NextResponse.json({ error: 'Unauthorized token' }, { status: 401 });
  }

  const result = stopAnnouncementSession(sessionId, 'manual');
  if (!result.ok) {
    return NextResponse.json({ error: 'Session mismatch', reason: result.reason }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

