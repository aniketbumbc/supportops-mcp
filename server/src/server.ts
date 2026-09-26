/**
 * MCP server entry point.
 * Startup order: adapters → services → Fastify app → routes → listen.
 *
 * Run with: pnpm dev
 */
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify';
import { createAdapters } from './adapters/index';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeDb, sql } from './db/client';
import { resolveCorrelationId } from './gateway/context';
import { createServices } from './services/index';
import { TOOL_REGISTRY } from './tools/index';
import { registerMcpRoutes, SERVER_INFO } from './transport/mcp';
import { getJwtKeys } from './gateway/keys';
import { authRoutes } from './transport/auth-routes';

type CheckResult = { ok: boolean; latencyMs: number; error?: string };

async function check(fn: () => Promise<unknown>): Promise<CheckResult> {
  const started = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: (error as Error).message,
    };
  }
}

export async function buildServer() {
  if (env.AUTH_MODE === 'jwt') {
    const { info, signing } = await getJwtKeys();
    logger.info(
      {
        ...info,
        signingKid: signing?.kid ?? null,
        signingAlg: signing?.alg ?? null,
      },
      'JWT keys loaded',
    );
  }
  //builds the CRM adapter, with
  // its HTTP client pointed at the mock API (base URL, API key and timeout from env).
  const adapters = createAdapters();
  //createServices(adapters) builds CustomerService, giving it the CRM adapter
  const services = createServices(adapters);

  const app = Fastify({
    loggerInstance: logger.child({
      service: 'mcp-server',
    }) as FastifyBaseLogger,
    // One ID per request: reuse a safe incoming x-request-id or generate one.
    genReqId: (req) => resolveCorrelationId(req.headers['x-request-id']),
    logController: new LogController({
      requestIdLogLabel: 'correlationId',
      // The MCP route logs its own concise line; skip Fastify's two-lines-per-request default.
      disableRequestLogging: true,
    }),
    bodyLimit: 1024 * 1024, // 1 MB is plenty for JSON-RPC messages
  });

  // Liveness + dependencies. 200 when everything is reachable, 503 otherwise.
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [database, mockSystems] = await Promise.all([
      check(() => sql`select 1`),
      check(async () => {
        const res = await fetch(`${env.MOCK_SYSTEMS_BASE_URL}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),
    ]);
    const healthy = database.ok && mockSystems.ok;
    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      service: SERVER_INFO.name,
      version: SERVER_INFO.version,
      checks: { database, mockSystems },
    });
  });

  if (env.AUTH_MODE === 'jwt') {
    await app.register(authRoutes, { services });
  }
  registerMcpRoutes(app, { services });

  return app;
}

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(
    {
      tools: TOOL_REGISTRY.map((t) => t.name),
      authMode: env.AUTH_MODE,
      mockSystems: env.MOCK_SYSTEMS_BASE_URL,
    },
    `${SERVER_INFO.name} ready at http://localhost:${env.PORT}/mcp`,
  );
}

main().catch((error) => {
  logger.fatal({ err: error }, 'MCP server failed to start');
  process.exit(1);
});
