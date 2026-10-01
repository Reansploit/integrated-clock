function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

export function getAnnouncementApiBase() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_LA_BASE_URL || '');
}

export function buildAnnouncementUrl(path: string) {
  const base = getAnnouncementApiBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

