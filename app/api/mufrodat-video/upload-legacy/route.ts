import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { ensureDatabase, upsertSetting } from '@/lib/db';

const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
const allowedVideoExtensions = new Set(['.mp4', '.webm']);
const allowedVideoMimeTypes = new Set(['video/mp4', 'video/webm']);

function sanitizeFileName(name: string, fallback = 'file') {
  const base = path.basename(name || fallback);
  return base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

function buildNoticeRedirect(request: NextRequest, notice: string) {
  const target = new URL('/admin', request.url);
  target.searchParams.set('notice', notice);
  return NextResponse.redirect(target);
}

async function upsertLegacySetting(key: string, value: string) {
  ensureDatabase();
  upsertSetting(key, value);
}

export async function POST(request: NextRequest) {
  try {
    ensureDatabase();

    const formData = await request.formData();
    const payload = formData.get('mufrodatVideo');
    if (!(payload instanceof File)) {
      return buildNoticeRedirect(request, 'mufrodat-upload-no-file');
    }

    if (!payload.size || payload.size > MAX_VIDEO_SIZE_BYTES) {
      return buildNoticeRedirect(request, 'mufrodat-upload-size-limit');
    }

    const originalName = sanitizeFileName(payload.name || 'mufrodat-video.mp4', 'mufrodat-video');
    const ext = path.extname(originalName).toLowerCase();
    if (!allowedVideoExtensions.has(ext)) {
      return buildNoticeRedirect(request, 'mufrodat-upload-ext-invalid');
    }

    const mime = String(payload.type || '').toLowerCase();
    if (mime && !allowedVideoMimeTypes.has(mime)) {
      return buildNoticeRedirect(request, 'mufrodat-upload-mime-invalid');
    }

    const nonce = randomUUID();
    const fileName = `${Date.now()}-${nonce}${ext}`;
    const relativePath = path.posix.join('videos', 'mufrodat', fileName);
    const destinationDir = path.join(process.cwd(), 'assets', 'videos', 'mufrodat');
    const destinationPath = path.join(destinationDir, fileName);

    await fs.mkdir(destinationDir, { recursive: true });
    const buffer = Buffer.from(await payload.arrayBuffer());
    await fs.writeFile(destinationPath, buffer);

    await Promise.all([
      upsertLegacySetting('mufrodatVideoUrl', `/assets/${relativePath}`),
      upsertLegacySetting('mufrodatVideoPlaybackNonce', nonce),
      upsertLegacySetting('mufrodatVideoPlaybackRequestedAt', new Date().toISOString()),
    ]);

    revalidatePath('/');
    revalidatePath('/admin');
    return buildNoticeRedirect(request, 'mufrodat-upload-ok');
  } catch (error) {
    console.error('Upload mufrodat legacy route gagal:', error);
    return buildNoticeRedirect(request, 'mufrodat-upload-failed');
  }
}

