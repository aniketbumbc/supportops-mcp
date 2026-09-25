/**
 * Our own business types. Vendor-neutral and camelCase.
 * Adapters convert each vendor's JSON into these; services and tools only ever see these.
 */

export type CustomerTier = 'standard' | 'business' | 'enterprise';
export type CustomerStatus = 'active' | 'suspended' | 'churned';

export interface Customer {
  customerRef: string;
  name: string;
  primaryEmail: string;
  phone: string | null;
  tier: CustomerTier;
  status: CustomerStatus;
  region: string;
  /** ISO 8601 date the customer relationship started. */
  customerSince: string;
}

export interface Contact {
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isPrimary: boolean;
}

export interface CustomerDetail extends Customer {
  contacts: Contact[];
}

/** One page of results from a list call. */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
}
