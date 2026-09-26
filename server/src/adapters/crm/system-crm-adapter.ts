import { z } from 'zod';
import type { Customer, CustomerDetail, Page } from '../../domain/type';
import { CUSTOMER_TIERS, CUSTOMER_STATUSES } from '../../domain/type';
import type { RequestContext } from '../../gateway/context';
import type { HttpClient } from '../http-client';
import type { CrmAdapter } from './crm-adapter';
import { parseResponse } from '../parse-response';

/**
 * The mock CRM's JSON, described with Zod. Parsing responses (not just typing them)
 * means a vendor change or bug is caught here, loudly, instead of leaking
 * half-broken data into services and the AI.
 */
const MockCustomer = z.object({
  customer_ref: z.string(),
  name: z.string(),
  primary_email: z.string(),
  phone: z.string().nullable(),
  tier: z.enum(CUSTOMER_TIERS),
  status: z.enum(CUSTOMER_STATUSES),
  region: z.string(),
  customer_since: z.string(),
});

const MockContact = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: z.string(),
  is_primary: z.boolean(),
});

const MockCustomerList = z.object({
  data: z.array(MockCustomer),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
});

const MockCustomerDetail = MockCustomer.extend({
  contacts: z.array(MockContact),
});

/** Vendor JSON → our domain type. The only place that knows both shapes. */
function toCustomer(c: z.infer<typeof MockCustomer>): Customer {
  return {
    customerRef: c.customer_ref,
    name: c.name,
    primaryEmail: c.primary_email,
    phone: c.phone,
    tier: c.tier,
    status: c.status,
    region: c.region,
    customerSince: c.customer_since,
  };
}

export class MockCrmAdapter implements CrmAdapter {
  constructor(private readonly http: HttpClient) {}

  async searchCustomers(
    ctx: RequestContext,
    params: { query: string; limit: number; offset?: number },
  ): Promise<Page<Customer>> {
    const raw = await this.http.get('/crm/v1/customers', ctx, {
      search: params.query,
      limit: params.limit,
      offset: params.offset,
    });
    const page = parseResponse(MockCustomerList, raw, ctx, {
      system: 'CRM',
      endpoint: 'GET /crm/v1/customers',
    });
    return {
      items: page.data.map(toCustomer),
      hasMore: page.has_more,
      nextOffset: page.next_offset,
    };
  }

  async getCustomer(
    ctx: RequestContext,
    customerRef: string,
  ): Promise<CustomerDetail> {
    const raw = await this.http.get(
      `/crm/v1/customers/${encodeURIComponent(customerRef)}`,
      ctx,
    );
    const c = parseResponse(MockCustomerDetail, raw, ctx, {
      system: 'CRM',
      endpoint: 'GET /crm/v1/customers/:ref',
    });
    return {
      ...toCustomer(c),
      contacts: c.contacts.map((ct) => ({
        name: ct.name,
        email: ct.email,
        phone: ct.phone,
        role: ct.role,
        isPrimary: ct.is_primary,
      })),
    };
  }
}
