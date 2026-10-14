/**
 * One recitation at a time on the board.
 *
 * The player is the only thing that knows a recitation is sounding, and three
 * other surfaces have to yield to it: the vocabulary cards, the mufrodat video
 * slot, and the board's own countdown tiles. Rather than poll for that state,
 * the player broadcasts it; a window event keeps the dependency one-directional
 * and survives the board reloading mid-recitation, since every listener
 * re-reads the current value on mount.
 */

export const RECITATION_ACTIVE_EVENT = 'board:recitation-active';

export type RecitationBroadcast = {
  active: boolean;
  label: string;
};

function broadcastActiveState() {
  return function send(detail: RecitationBroadcast) {
    window.dispatchEvent(new CustomEvent<RecitationBroadcast>(RECITATION_ACTIVE_EVENT, { detail }));
  };
}

export const announceRecitationActive = broadcastActiveState();

export function subscribeToRecitationActive(listener: (detail: RecitationBroadcast) => void): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<RecitationBroadcast>).detail);
  };

  window.addEventListener(RECITATION_ACTIVE_EVENT, handler);
  return () => window.removeEventListener(RECITATION_ACTIVE_EVENT, handler);
}

/**
 * A listener mounted after the player already started would otherwise see
 * nothing until the next slot, so the player also stamps a flag the first
 * listener can check synchronously.
 */
export function isRecitationActive(): boolean {
  return document.documentElement.classList.contains('recitation-active');
}
