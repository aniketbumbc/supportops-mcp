import { env } from '../config/env.js';
import type { CrmAdapter } from './crm/crm-adapter.js';
import { MockCrmAdapter } from './crm/system-crm-adapter.js';
import { createHttpClient } from './http-client.js';

export interface Adapters {
  crm: CrmAdapter;
}

/**
 * Builds every adapter once at startup. This is the single swap point:
 * to use a real CRM, return a different CrmAdapter implementation here.
 */
export function createAdapters(): Adapters {
  const systems = (system: string) =>
    createHttpClient({
      system,
      baseUrl: env.MOCK_SYSTEMS_BASE_URL,
      apiKey: env.MOCK_SYSTEMS_API_KEY,
      timeoutMs: env.UPSTREAM_TIMEOUT_MS,
    });

  return {
    crm: new MockCrmAdapter(systems('CRM')),
  };
}
