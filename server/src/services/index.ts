import type { Adapters } from '../adapters/index';
import { CustomerService } from './customer-service';
import { BillingService } from './billing-service';
import { SupportService } from './support-service';
import { AuthService } from './auth-service';

export interface Services {
  customers: CustomerService;
  billing: BillingService;
  support: SupportService;
  auth: AuthService;
}

/** Builds every service once at startup, wiring in the adapters they need. */
export function createServices(adapters: Adapters): Services {
  return {
    customers: new CustomerService(
      adapters.crm,
      adapters.billing,
      adapters.ticketing,
    ),
    billing: new BillingService(adapters.billing, adapters.crm),
    support: new SupportService(adapters.ticketing),
    auth: new AuthService(),
  };
}
