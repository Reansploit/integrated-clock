import { NextRequest, NextResponse } from 'next/server';

import { leaveAnnouncementViewer } from '@/lib/announcement/serverStore';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const viewerId = String(body.viewerId || '').trim();

  if (!viewerId) {
    return NextResponse.json({ error: 'viewerId is required' }, { status: 400 });
  }

  const result = leaveAnnouncementViewer(viewerId);
  if (!result.ok) {
    return NextResponse.json({ error: 'Viewer leave failed', reason: result.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
