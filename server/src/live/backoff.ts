/** Exponential backoff: 1, 2, 4… s, capped at 30 s, with ±20% jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  const jitter = base * 0.2 * (random() * 2 - 1);
  return Math.round(Math.min(30_000, base + jitter));
}
