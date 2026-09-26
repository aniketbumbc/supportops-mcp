import { env } from '../config/env.js';
import type { BillingAdapter } from './billing/billing-adapter';
import { MockBillingAdapter } from './billing/mock-billing-adapter';
import type { CrmAdapter } from './crm/crm-adapter';
import { MockCrmAdapter } from './crm/system-crm-adapter';
import { createHttpClient } from './http-client';
import { MockTicketingAdapter } from './ticketing/mock-ticketing-adapter';
import type { TicketingAdapter } from './ticketing/ticketing-adapter';

export interface Adapters {
  crm: CrmAdapter;
  billing: BillingAdapter;
  ticketing: TicketingAdapter;
}

/**
 * Builds every adapter once at startup. This is the single swap point:
 * to use a real system, return a different implementation here.
 */
export function createAdapters(): Adapters {
  const mockSystems = (system: string) =>
    createHttpClient({
      system,
      baseUrl: env.MOCK_SYSTEMS_BASE_URL,
      apiKey: env.MOCK_SYSTEMS_API_KEY,
      timeoutMs: env.UPSTREAM_TIMEOUT_MS,
    });

  return {
    crm: new MockCrmAdapter(mockSystems('CRM')),
    billing: new MockBillingAdapter(mockSystems('Billing')),
    ticketing: new MockTicketingAdapter(mockSystems('Ticketing')),
  };
}
