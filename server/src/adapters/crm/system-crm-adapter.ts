import { z } from 'zod';
import type { Customer, CustomerDetail, Page } from '../../domain/types.js';
import { AppError } from '../../errors/index.js';
import type { RequestContext } from '../../gateway/context.js';
import type { HttpClient } from '../http-client.js';
import type { CrmAdapter } from './crm-adapter.js';

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
  tier: z.enum(['standard', 'business', 'enterprise']),
  status: z.enum(['active', 'suspended', 'churned']),
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

function parseResponse<S extends z.ZodType>(
  schema: S,
  data: unknown,
  ctx: RequestContext,
  endpoint: string,
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    ctx.log.error(
      { system: 'CRM', endpoint, issues: result.error.issues.slice(0, 5) },
      'CRM response did not match the expected shape',
    );
    throw new AppError(
      'INTERNAL_ERROR',
      'Something went wrong while running this tool.',
    );
  }
  return result.data;
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
    const page = parseResponse(
      MockCustomerList,
      raw,
      ctx,
      'GET /crm/v1/customers',
    );
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
    const c = parseResponse(
      MockCustomerDetail,
      raw,
      ctx,
      'GET /crm/v1/customers/:ref',
    );
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
