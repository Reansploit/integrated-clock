import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

import { NextRequest, NextResponse } from 'next/server';

const assetsRoot = path.join(process.cwd(), 'assets');

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.aac') return 'audio/aac';
  return 'application/octet-stream';
}

type ParsedRangeResult =
  | { kind: 'ok'; start: number; end: number }
  | { kind: 'fallback' }
  | { kind: 'unsatisfiable' };

function parseRangeHeader(rangeHeader: string, fileSize: number): ParsedRangeResult {
  const [unitPart, valuePart] = rangeHeader.split('=', 2);
  if (!unitPart || !valuePart || unitPart.trim().toLowerCase() !== 'bytes') {
    return { kind: 'fallback' };
  }

  // Multipart byterange responses are not implemented here.
  // When player requests multiple ranges, fallback to full-body response.
  if (valuePart.includes(',')) {
    return { kind: 'fallback' };
  }

  const firstRange = valuePart.trim();
  const [rawStart = '', rawEnd = ''] = firstRange.split('-', 2).map((part) => part.trim());

  if (!rawStart && !rawEnd) return { kind: 'fallback' };
  if (fileSize <= 0) return { kind: 'unsatisfiable' };

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { kind: 'fallback' };
    const start = Math.max(fileSize - suffixLength, 0);
    const end = fileSize - 1;
    return { kind: 'ok', start, end };
  }

  const start = Number(rawStart);
  let end = rawEnd ? Number(rawEnd) : fileSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return { kind: 'fallback' };
  if (start < 0 || end < start) return { kind: 'fallback' };

  end = Math.min(end, fileSize - 1);
  if (start >= fileSize) return { kind: 'unsatisfiable' };

  return { kind: 'ok', start, end };
}

async function resolveAssetPath(params: Promise<{ path: string[] }>) {
  const { path: pathSegments } = await params;
  const relativePath = pathSegments.join('/');
  const filePath = path.normalize(path.join(assetsRoot, relativePath));

  if (!filePath.startsWith(assetsRoot)) {
    return '';
  }

  return filePath;
}

function getBaseHeaders(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const longCacheExt = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.mp4',
    '.webm',
    '.mp3',
    '.wav',
    '.ogg',
    '.m4a',
    '.aac',
  ]);
  const cacheControl = longCacheExt.has(ext)
    ? 'public, max-age=3600, stale-while-revalidate=86400'
    : 'public, max-age=300, stale-while-revalidate=3600';

  return {
    'Content-Type': getContentType(filePath),
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  };
}

function createFullAssetResponse(filePath: string, contentLength: number, headers: Record<string, string>) {
  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      ...headers,
      'Content-Length': String(contentLength),
    },
  });
}

export async function HEAD(_: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const filePath = await resolveAssetPath(params);
  if (!filePath) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const stats = await fs.stat(filePath);
    return new NextResponse(null, {
      headers: {
        ...getBaseHeaders(filePath),
        'Content-Length': String(stats.size),
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const filePath = await resolveAssetPath(params);
  if (!filePath) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const stats = await fs.stat(filePath);
    const baseHeaders = getBaseHeaders(filePath);
    const rangeHeader = request.headers.get('range');

    if (!rangeHeader) {
      return createFullAssetResponse(filePath, stats.size, baseHeaders);
    }

    const parsedRange = parseRangeHeader(rangeHeader, stats.size);
    if (parsedRange.kind === 'fallback') {
      // Be tolerant with non-standard ranges so browser video players still work.
      return createFullAssetResponse(filePath, stats.size, baseHeaders);
    }

    if (parsedRange.kind === 'unsatisfiable') {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Length': '0',
          'Content-Range': `bytes */${stats.size}`,
        },
      });
    }

    const { start, end } = parsedRange;
    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
