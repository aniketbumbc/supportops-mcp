import type { Adapters } from '../adapters/index';
import { CustomerService } from './customer-service';

export interface Services {
  customers: CustomerService;
}

/** Builds every service once at startup, wiring in the adapters they need. */
export function createServices(adapters: Adapters): Services {
  return {
    customers: new CustomerService(
      adapters.crm,
      adapters.billing,
      adapters.ticketing,
    ),
  };
}
