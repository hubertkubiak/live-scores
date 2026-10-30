import { buildApp } from './app';
import { config } from './config';
import { LiveHub } from './live/hub';
import { MockProvider } from './providers/mock';
import { SportsApiProProvider } from './providers/sportsApiPro';
import type { ScoresProvider } from './providers/types';

const mock = () => new MockProvider({ timeZone: config.defaultTimeZone });

const provider: ScoresProvider =
  config.provider === 'sportsapipro' && config.apiKey
    ? new SportsApiProProvider({
        apiKey: config.apiKey,
        baseUrl: config.apiBase,
        wsUrl: process.env.SPORTS_API_WS?.trim() || undefined,
      })
    : mock();

const hub = new LiveHub(provider, {
  snapshotRefreshMs: config.snapshotRefreshMs,
  fallback: mock,
});

const app = await buildApp(hub, config.defaultTimeZone, config.staticDir);
await hub.start();
await app.listen({ port: config.port, host: config.host });
app.log.info(`provider: ${hub.providerName}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    hub.stop();
    void app.close().then(() => process.exit(0));
  });
}
