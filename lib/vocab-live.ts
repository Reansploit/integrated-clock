import fs from 'fs';
import path from 'path';

export type VocabLiveState = {
  slotId: number;
  index: number;
  nonce: string;
  updatedAt: string;
};

function getLiveFilePath() {
  const configured = process.env.VOCAB_LIVE_FILE?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), 'data', 'vocab-live.json');
}

export function getVocabLive(): VocabLiveState | null {
  try {
    const raw = fs.readFileSync(getLiveFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<VocabLiveState>;
    const slotId = Number(parsed.slotId);
    const index = Number(parsed.index);
    if (!Number.isFinite(slotId) || slotId <= 0) return null;
    return {
      slotId,
      index: Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0,
      nonce: String(parsed.nonce || ''),
      updatedAt: String(parsed.updatedAt || ''),
    };
  } catch {
    return null;
  }
}

export function setVocabLive(state: Omit<VocabLiveState, 'updatedAt'>) {
  const filePath = getLiveFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload: VocabLiveState = { ...state, updatedAt: new Date().toISOString() };
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload));
  fs.renameSync(tmpPath, filePath);
  return payload;
}

export function clearVocabLive() {
  try {
    fs.unlinkSync(getLiveFilePath());
  } catch {
    // No live state to clear.
  }
}
