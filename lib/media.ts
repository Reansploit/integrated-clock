import fs from 'fs';
import path from 'path';

const assetsRoot = path.join(process.cwd(), 'assets');

function isRemoteUrl(value: string) {
  return /^(https?:)?\/\//i.test(value) || value.startsWith('data:');
}

function normalizeAssetUrl(relativePath: string) {
  return `/assets/${relativePath.split(path.sep).join('/')}`;
}

/**
 * path.relative() hands back the platform separator, so on Windows it produces
 * "audio\events\alarm.mp3" while every directory list and URL in this file is
 * written with forward slashes. Comparing the two directly never matches, which
 * is why the folder scans used to come back empty on Windows. Converting here
 * keeps the comparisons and the emitted URLs in one spelling.
 */
function toPosixRelative(root: string, file: string) {
  return path.relative(root, file).split(path.sep).join('/');
}

function readAssetFiles(root: string, files: string[] = []) {
  if (!fs.existsSync(root)) {
    return files;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      readAssetFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function tryResolveRelativePath(value: string) {
  const directPath = path.resolve(assetsRoot, value);
  if (!directPath.startsWith(assetsRoot)) {
    return '';
  }

  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return normalizeAssetUrl(path.relative(assetsRoot, directPath));
  }

  return '';
}

export function resolveAssetUrl(value: string, preferredDirs: string[] = []) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (isRemoteUrl(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/assets/')) {
    return trimmed;
  }

  // Support values like "/backgrounds/bg.gif" by treating them as assets-relative.
  if (trimmed.startsWith('/')) {
    const fromAbsoluteLike = tryResolveRelativePath(trimmed.replace(/^\/+/, ''));
    if (fromAbsoluteLike) {
      return fromAbsoluteLike;
    }
  }

  if (trimmed.startsWith('assets/')) {
    return `/${trimmed}`;
  }

  const directRelative = tryResolveRelativePath(trimmed);
  if (directRelative) {
    return directRelative;
  }

  const assetFiles = readAssetFiles(assetsRoot);
  const normalizedPreferred = preferredDirs.map((dir) => dir.replace(/^\/+|\/+$/g, '').toLowerCase());
  const filename = path.basename(trimmed).toLowerCase();

  const preferredMatch = assetFiles.find((file) => {
    const relativeLower = toPosixRelative(assetsRoot, file).toLowerCase();
    const nameMatches = path.basename(relativeLower) === filename;
    const folderMatches = normalizedPreferred.some((dir) => relativeLower.startsWith(`${dir}/`));
    return nameMatches && (folderMatches || normalizedPreferred.length === 0);
  });

  if (preferredMatch) {
    return normalizeAssetUrl(path.relative(assetsRoot, preferredMatch));
  }

  const fallbackMatch = assetFiles.find((file) => path.basename(file).toLowerCase() === filename);
  return fallbackMatch ? normalizeAssetUrl(path.relative(assetsRoot, fallbackMatch)) : trimmed;
}

export function listAssetUrls(preferredDirs: string[] = [], extensions: string[] = []) {
  const assetFiles = readAssetFiles(assetsRoot);
  const normalizedPreferred = preferredDirs
    .map((dir) => dir.replace(/^\/+|\/+$/g, '').toLowerCase())
    .filter(Boolean);
  const normalizedExtensions = extensions.map((ext) => ext.toLowerCase());

  return assetFiles
    .map((file) => toPosixRelative(assetsRoot, file))
    .filter((relative) => {
      const relativeLower = relative.toLowerCase();
      const inPreferred =
        normalizedPreferred.length === 0 ||
        normalizedPreferred.some((dir) => relativeLower.startsWith(`${dir}/`) || relativeLower === dir);
      if (!inPreferred) {
        return false;
      }

      if (!normalizedExtensions.length) {
        return true;
      }

      const fileExt = path.extname(relativeLower);
      return normalizedExtensions.includes(fileExt);
    })
    .sort((left, right) => left.localeCompare(right))
    .map((relative) => normalizeAssetUrl(relative));
}
