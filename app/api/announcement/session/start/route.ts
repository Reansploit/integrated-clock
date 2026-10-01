import { NextRequest, NextResponse } from 'next/server';

import { isAuthorizedAnnouncementToken, startAnnouncementSession } from '@/lib/announcement/serverStore';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = body.token;
  const mimeType = String(body.mimeType || 'audio/webm;codecs=opus');

  if (!isAuthorizedAnnouncementToken(token)) {
    return NextResponse.json({ error: 'Unauthorized token' }, { status: 401 });
  }

  const result = startAnnouncementSession(mimeType);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'Announcement already active',
        reason: result.reason,
        snapshot: result.snapshot,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId: result.sessionId,
    mimeType: result.mimeType,
  });
}

