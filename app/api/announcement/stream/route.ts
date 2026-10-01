import { NextRequest } from 'next/server';

import { subscribeAnnouncementEvents } from '@/lib/announcement/serverStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encodeSse(eventName: string, payload: Record<string, unknown>) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: NextRequest) {
  const roleParam = request.nextUrl.searchParams.get('role');
  const viewerIdParam = request.nextUrl.searchParams.get('viewerId');

  const role = roleParam === 'admin' || roleParam === 'viewer' ? roleParam : 'public';
  const viewerId = role === 'viewer' ? String(viewerIdParam || '').trim() : '';

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('retry: 800\n: connected\n\n'));

      unsubscribe = subscribeAnnouncementEvents({ role, viewerId: viewerId || undefined }, (eventName, payload) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(eventName, payload)));
        } catch {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          try {
            controller.close();
          } catch {
            // noop
          }
        }
      });
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
