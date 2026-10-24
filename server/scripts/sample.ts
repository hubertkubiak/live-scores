/**
 * SPEC task 0: captures real SportsAPI Pro responses into server/fixtures/ so the Zod
 * schemas in src/providers/sportsApiPro.ts can be checked against them.
 *
 * Uses 8 REST requests (out of 100/day) plus 30 s of WebSocket traffic, which is free.
 * Run: npm run sample -w server (needs SPORTS_API_KEY in server/.env)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { config } from '../src/config';

const SPORTS = ['football', 'tennis', 'basketball', 'hockey'];
const WS_SECONDS = 30;
const outDir = fileURLToPath(new URL('../fixtures/', import.meta.url));

if (!config.apiKey) {
  console.error('SPORTS_API_KEY is not set in server/.env');
  process.exit(1);
}
const apiKey = config.apiKey;
await mkdir(outDir, { recursive: true });

for (const sport of SPORTS) {
  const base = config.apiBase.replaceAll('{sport}', sport);
  for (const [name, path] of [
    ['live', `/api/v1/${sport}/live`],
    ['current', '/games/current'],
  ] as const) {
    const res = await fetch(base + path, { headers: { 'x-api-key': apiKey } });
    const body = await res.text();
    const file = `${outDir}${sport}-${name}.json`;
    await writeFile(file, body);
    console.log(
      `${res.status} ${sport} ${name} → ${file} (remaining: ${res.headers.get('x-ratelimit-remaining')})`,
    );
  }
}

const wsBase = config.apiBase.replaceAll('{sport}', 'football').replace(/^http/, 'ws');
const url = new URL(process.env.SPORTS_API_WS?.trim() || `${wsBase}/ws`);
url.searchParams.set('x-api-key', apiKey);

const messages: unknown[] = [];
await new Promise<void>((resolve) => {
  const socket = new WebSocket(url);
  socket.on('open', () => socket.send(JSON.stringify({ type: 'subscribe', channel: 'live' })));
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  socket.on('error', (err) => console.error(`websocket error: ${err.message}`));
  setTimeout(() => {
    socket.close();
    resolve();
  }, WS_SECONDS * 1000);
});
await writeFile(`${outDir}ws-live.json`, JSON.stringify(messages, null, 2));
console.log(`${messages.length} websocket messages → ${outDir}ws-live.json`);
