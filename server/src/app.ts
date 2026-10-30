import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { z } from 'zod';
import { CATEGORIES, type ClientMessage, type SportCategory } from '@live-scores/shared';
import type { LiveHub } from './live/hub';

const MatchesQuery = z.object({
  category: z.enum(CATEGORIES as [SportCategory, ...SportCategory[]]),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tz: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    })
    .optional(),
});

const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), category: MatchesQuery.shape.category }),
  z.object({ type: z.literal('ping') }),
]);

export async function buildApp(
  hub: LiveHub,
  defaultTimeZone = 'Europe/Warsaw',
  staticDir?: string,
) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? (process.env.VITEST ? 'silent' : 'info') },
  });
  await app.register(websocket);

  // Production: serve the built web app from the same origin, so /api and /ws need no proxy.
  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api') && !/\.\w+$/.test(req.url.split('?')[0]!)
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'NOT_FOUND' }),
    );
  }

  app.get('/api/health', async () => hub.health());

  app.get('/api/sports', async () => hub.sportCounts());

  app.get('/api/matches', async (req, reply) => {
    const query = MatchesQuery.safeParse(req.query);
    if (!query.success) {
      return reply
        .code(400)
        .send({ error: 'BAD_REQUEST', message: query.error.issues[0]?.message });
    }
    const { category, date, tz = defaultTimeZone } = query.data;
    const error = hub.errorFor(category);
    if (error) return reply.code(error.error === 'RATE_LIMITED' ? 429 : 502).send(error);
    return hub.matchesFor(category, date, tz);
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const client = hub.addClient((msg) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    });
    socket.on('message', (raw: Buffer) => {
      let parsed: ClientMessage;
      try {
        const result = ClientMessageSchema.safeParse(JSON.parse(raw.toString()));
        if (!result.success) return;
        parsed = result.data;
      } catch {
        return;
      }
      if (parsed.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      else client.subscribe(parsed.category);
    });
    socket.on('close', () => client.remove());
  });

  return app;
}
