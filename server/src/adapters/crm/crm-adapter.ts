import type {
  Customer,
  CustomerDetail,
  CustomerStatus,
  CustomerTier,
  Page,
} from '../../domain/type';
import type { RequestContext } from '../../gateway/context';

export interface CreateCustomerInput {
  name: string;
  primaryEmail: string;
  phone?: string;
  tier: CustomerTier;
  region: string;
  primaryContact: { name: string; email: string; phone?: string; role: string };
}

/** Only the fields given are changed. phone: null clears it. */
export interface CustomerPatch {
  name?: string;
  primaryEmail?: string;
  phone?: string | null;
  tier?: CustomerTier;
  status?: CustomerStatus;
  region?: string;
}

/**
 * What the rest of the system needs from a CRM. Any CRM (the mock today,
 * HubSpot or Salesforce later) plugs in by implementing this interface.
 */
export interface CrmAdapter {
  searchCustomers(
    ctx: RequestContext,
    params: { query: string; limit: number; offset?: number },
  ): Promise<Page<Customer>>;

  /** Throws NOT_FOUND if the customer does not exist. */
  getCustomer(
    ctx: RequestContext,
    customerRef: string,
  ): Promise<CustomerDetail>;

  /** Throws CONFLICT if the email is already used by another customer. */
  createCustomer(
    ctx: RequestContext,
    input: CreateCustomerInput,
  ): Promise<CustomerDetail>;

  /** Throws NOT_FOUND / CONFLICT. Returns the customer and a readable list of changes. */
  updateCustomer(
    ctx: RequestContext,
    customerRef: string,
    patch: CustomerPatch,
  ): Promise<{ customer: CustomerDetail; changesApplied: string[] }>;
}
