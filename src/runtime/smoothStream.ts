/**
 * The smoothing layer that makes streaming *feel* frontier-grade.
 *
 * Network chunks arrive in bursts (1-3 words at irregular intervals). Naively
 * rendering each chunk makes text lurch. Instead we buffer incoming chunks
 * and reveal characters on a fixed ~30 ms cadence, adapting the reveal rate
 * to the backlog: shallow backlog → a few chars per tick (typewriter),
 * deep backlog → accelerate smoothly to catch up. This mirrors what the
 * ChatGPT and Claude apps do client-side.
 */

export type SmoothTickHandler = (accumulated: string) => void;

const TICK_MS = 30;
const MIN_CHARS_PER_TICK = 2;
const MAX_CHARS_PER_TICK = 110;

export const createSmoother = () => {
  let buffer = "";
  let revealed = 0;
  let sourceDone = false;

  return {
    push(chunk: string) {
      buffer += chunk;
    },
    finish() {
      sourceDone = true;
    },
    /** Reveal-all, used on cancellation so partial text isn't lost. */
    flush(): string {
      revealed = buffer.length;
      return buffer;
    },
    get done(): boolean {
      return sourceDone && revealed >= buffer.length;
    },
    get hasNew(): boolean {
      return revealed < buffer.length;
    },
    tickMs: TICK_MS,
    /** Advance one tick; returns the accumulated visible text. */
    tick(): string {
      const backlog = buffer.length - revealed;
      if (backlog <= 0) return buffer.slice(0, revealed);
      // If the source already finished, drain fast but still smoothly.
      const urgency = sourceDone ? backlog / 4 : backlog / 9;
      const step = Math.min(
        MAX_CHARS_PER_TICK,
        Math.max(MIN_CHARS_PER_TICK, Math.round(urgency)),
      );
      revealed = Math.min(buffer.length, revealed + step);
      return buffer.slice(0, revealed);
    },
  };
};
