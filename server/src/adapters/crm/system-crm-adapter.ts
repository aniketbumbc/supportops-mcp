import { z } from 'zod';
import {
  CUSTOMER_STATUSES,
  CUSTOMER_TIERS,
  type Customer,
  type CustomerDetail,
  type Page,
} from '../../domain/type';
import type { RequestContext } from '../../gateway/context';
import type { HttpClient } from '../http-client';
import { parseResponse } from '../parse-response';
import type {
  CreateCustomerInput,
  CrmAdapter,
  CustomerPatch,
} from './crm-adapter';

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
const MockCustomerUpdate = MockCustomerDetail.extend({
  changes_applied: z.array(z.string()),
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

function toDetail(c: z.infer<typeof MockCustomerDetail>): CustomerDetail {
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
    return toDetail(
      parseResponse(MockCustomerDetail, raw, ctx, {
        system: 'CRM',
        endpoint: 'GET /crm/v1/customers/:ref',
      }),
    );
  }

  async createCustomer(
    ctx: RequestContext,
    input: CreateCustomerInput,
  ): Promise<CustomerDetail> {
    const raw = await this.http.post('/crm/v1/customers', ctx, {
      name: input.name,
      primary_email: input.primaryEmail,
      phone: input.phone,
      tier: input.tier,
      region: input.region,
      primary_contact: {
        name: input.primaryContact.name,
        email: input.primaryContact.email,
        phone: input.primaryContact.phone,
        role: input.primaryContact.role,
      },
      created_by: ctx.userId,
    });
    return toDetail(
      parseResponse(MockCustomerDetail, raw, ctx, {
        system: 'CRM',
        endpoint: 'POST /crm/v1/customers',
      }),
    );
  }

  async updateCustomer(
    ctx: RequestContext,
    customerRef: string,
    patch: CustomerPatch,
  ): Promise<{ customer: CustomerDetail; changesApplied: string[] }> {
    const raw = await this.http.patch(
      `/crm/v1/customers/${encodeURIComponent(customerRef)}`,
      ctx,
      {
        name: patch.name,
        primary_email: patch.primaryEmail,
        phone: patch.phone,
        tier: patch.tier,
        status: patch.status,
        region: patch.region,
        updated_by: ctx.userId,
      },
    );
    const c = parseResponse(MockCustomerUpdate, raw, ctx, {
      system: 'CRM',
      endpoint: 'PATCH /crm/v1/customers/:ref',
    });
    return { customer: toDetail(c), changesApplied: c.changes_applied };
  }
}
