'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { measureSoundDurations } from '@/app/admin/actions';

type SoundRef = {
  url: string;
  label: string;
  durationMs: number;
};

type Props = {
  sounds: SoundRef[];
};

/**
 * Reads the length of every sound in the library, in the operator's browser.
 *
 * The planner will not put a file on a run whose length it cannot prove, so a
 * fresh install needs this pass before any slot plays: without it every item is
 * left out with "durasi belum diketahui". The numbers go to the server once, and
 * the measured column next to each row is what makes a slot's fit readable.
 */
export function SoundDurationMeter({ sounds }: Props) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'measuring' | 'saved'>('idle');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const measuredRef = useRef(new Map<string, number>());

  // Metadata can arrive from the operator's own previewing before the sweep
  // runs, so the sweep only re-reads what it has not seen.
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[src]'));

    for (const element of elements) {
      const src = element.getAttribute('src') || element.src;
      if (!src) continue;
      const remember = () => {
        if (Number.isFinite(element.duration) && element.duration > 0) {
          measuredRef.current.set(src, Math.round(element.duration * 1000));
        }
      };
      element.addEventListener('loadedmetadata', remember);
      remember();
    }
  }, [sounds]);

  const measureAll = useCallback(async () => {
    setState('measuring');
    setError('');
    setSummary('Membaca durasi…');

    const entries: Array<{ url: string; durationMs: number }> = [];
    for (const sound of sounds) {
      const durationMs = await readDuration(sound.url);
      if (durationMs > 0) {
        entries.push({ url: sound.url, durationMs });
      }
    }

    if (!entries.length) {
      setState('idle');
      setSummary('');
      setError('Tidak ada file yang bisa dibaca durasinya. Coba muat ulang halaman ini.');
      return;
    }

    try {
      const result = await measureSoundDurations({ entries });
      setState('saved');
      setSummary(`${result.measured} file sudah punya durasi.`);
      router.refresh();
    } catch (measureError) {
      setState('idle');
      setSummary('');
      setError(
        measureError instanceof Error
          ? measureError.message
          : 'Gagal menyimpan durasi. Lihat log terminal untuk detailnya.',
      );
    }
  }, [router, sounds]);

  return (
    <div className="duration-meter">
      <button type="button" className="btn" onClick={measureAll} disabled={state === 'measuring'}>
        {state === 'measuring' ? 'Mengukur…' : 'Ukur semua durasi'}
      </button>
      <p className="duration-meter__note">
        Papan hanya memutar file yang panjangnya sudah diketahui, supaya tidak ada rekaman yang kepotong di
        tengah. Sekali diukur, durasi ini dipakai bersama semua slot.
      </p>
      {summary ? <p className="duration-meter__summary">{summary}</p> : null}
      {error ? (
        <p className="duration-meter__summary" data-tone="error" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One element per file, loaded for metadata only. Rejected loads resolve to 0
 * so a single unreadable file cannot stall the whole sweep.
 */
function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;

    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute('src');
      audio.load();
      resolve(value);
    };

    const timeoutId = window.setTimeout(() => finish(0), 20_000);
    const done = () => {
      window.clearTimeout(timeoutId);
      finish(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0);
    };

    audio.addEventListener('loadedmetadata', done, { once: true });
    audio.addEventListener('error', () => {
      window.clearTimeout(timeoutId);
      finish(0);
    }, { once: true });
    audio.preload = 'metadata';
    audio.src = url;
  });
}
