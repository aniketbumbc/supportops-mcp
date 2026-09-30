import type { Adapters } from '../adapters/index.js';
import { ApprovalService } from './approval-service';
import { AuthService } from './auth-service';
import { BillingService } from './billing-service';
import { CustomerService } from './customer-service';
import { RefundEvaluator } from './refund-evaluator';
import { RefundService } from './refund-service';
import { SupportService } from './support-service';
import { AuditService } from './audit-service';

export interface Services {
  auth: AuthService;
  customers: CustomerService;
  billing: BillingService;
  support: SupportService;
  refunds: RefundService;
  approvals: ApprovalService;
  audit: AuditService;
}

/** Builds every service once at startup, wiring in the adapters they need. */
export function createServices(adapters: Adapters): Services {
  const evaluator = new RefundEvaluator(adapters.crm, adapters.billing);
  const refunds = new RefundService(
    evaluator,
    adapters.billing,
    adapters.ticketing,
  );
  return {
    auth: new AuthService(),
    customers: new CustomerService(
      adapters.crm,
      adapters.billing,
      adapters.ticketing,
    ),
    billing: new BillingService(adapters.billing, adapters.crm),
    support: new SupportService(adapters.ticketing),
    refunds,
    approvals: new ApprovalService(evaluator, refunds, adapters.ticketing),
    audit: new AuditService(),
  };
}
