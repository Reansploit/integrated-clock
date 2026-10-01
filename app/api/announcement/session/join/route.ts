import { NextRequest, NextResponse } from 'next/server';

import { joinAnnouncementViewer } from '@/lib/announcement/serverStore';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const viewerId = String(body.viewerId || '').trim();

  if (!viewerId) {
    return NextResponse.json({ error: 'viewerId is required' }, { status: 400 });
  }

  const result = joinAnnouncementViewer(viewerId);
  if (!result.ok) {
    const status = result.reason === 'no_active_session' ? 409 : 400;
    return NextResponse.json({ error: 'Viewer join failed', reason: result.reason }, { status });
  }

  return NextResponse.json({
    ok: true,
    sessionId: result.sessionId,
    mimeType: result.mimeType,
  });
}
