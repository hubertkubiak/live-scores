import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // No server/.env: defaults below apply and the server runs on the mock.
}

const apiKey = process.env.SPORTS_API_KEY?.trim() || undefined;
const requested = process.env.DATA_PROVIDER?.trim();

export const config = {
  apiKey,
  apiBase: process.env.SPORTS_API_BASE?.trim() || 'https://v1.{sport}.sportsapipro.com',
  // Without a key the real provider cannot work, so the mock is forced.
  provider: (apiKey && requested !== 'mock' ? 'sportsapipro' : 'mock') as 'sportsapipro' | 'mock',
  port: Number(process.env.PORT) || 8787,
  snapshotRefreshMs: (Number(process.env.SNAPSHOT_REFRESH_MINUTES) || 10) * 60_000,
  defaultTimeZone: 'Europe/Warsaw',
};
