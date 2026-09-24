/**
 * Mock systems of record: CRM, billing/payments and ticketing in one small API.
 * The MCP server reaches these ONLY through its adapters, exactly as it would
 * reach real vendors. Protected by an API key, like a vendor API.
 *
 * Run with: pnpm dev:mock
 */
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { closeDb, sql } from '../db/client';
import { registerApiKeyAuth, registerErrorHandler } from './lib/helper';
import { billingRoutes } from './routes/billing';
import { crmRoutes } from './routes/crm';
import { ticketingRoutes } from './routes/ticketing';

export async function buildMockServer() {
  const app = Fastify({
    loggerInstance: logger.child({
      service: 'mock-systems',
    }) as FastifyBaseLogger,
  });

  registerErrorHandler(app);
  registerApiKeyAuth(app, env.MOCK_SYSTEMS_API_KEY);

  app.get('/health', async () => {
    await sql`select 1`;
    return { status: 'ok', service: 'crm-system' };
  });

  await app.register(crmRoutes);
  await app.register(billingRoutes);
  await app.register(ticketingRoutes);

  return app;
}

async function main() {
  const app = await buildMockServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.MOCK_SYSTEMS_PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  logger.fatal({ err: error }, 'CRM System failed to start');
  process.exit(1);
});
