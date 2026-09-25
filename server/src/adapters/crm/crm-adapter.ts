import type { Customer, CustomerDetail, Page } from '../../domain/type';
import type { RequestContext } from '../../gateway/context';

/**
 * What the rest of the system needs from a CRM. Any CRM (the mock today,
 * HubSpot or Salesforce later) plugs in by implementing this interface.
 * Create/update methods are added in Phase 6 with the write tools.
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
}
