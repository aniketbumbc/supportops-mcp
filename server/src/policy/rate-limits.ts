import type { ToolName } from './tool-names';

/**
 * Every rate limit in one place. Numbers follow docs/tool-contract.md §3.
 * The limiter (Step 3) enforces them in Redis with a sliding window.
 */

export interface RateLimitRule {
  /** Short, stable name: used in Redis keys, logs and error messages. */
  name: string;
  /** Maximum requests allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Limits on the /mcp endpoint itself. */
export const MCP_LIMITS = {
  /** Every MCP request (tools/list, tools/call...) by one user. */
  perUser: { name: 'mcp-user', limit: 100, windowSec: MINUTE },
  /**
   * Every MCP request from one IP, checked BEFORE the token is verified, so floods of
   * junk or stolen-token guesses never reach the verifier or the database.
   * Generous, because a whole office can share one IP.
   */
  perIp: { name: 'mcp-ip', limit: 300, windowSec: MINUTE },
} satisfies Record<string, RateLimitRule>;

/** Limits on the auth endpoints. */
export const AUTH_LIMITS = {
  /** Failed logins for one email from one IP: guessing one account's password. */
  loginPerEmailAndIp: {
    name: 'login-email-ip',
    limit: 5,
    windowSec: 15 * MINUTE,
  },
  /** Failed logins from one IP for any email: trying many accounts. */
  loginPerIp: { name: 'login-ip', limit: 20, windowSec: 15 * MINUTE },
  /** Personal access tokens created by one user. */
  patCreatePerUser: { name: 'pat-create', limit: 10, windowSec: HOUR },
  /** Demo logins from one visitor IP. */
  demoPerIp: { name: 'demo-ip', limit: 1, windowSec: 30 * MINUTE },
} satisfies Record<string, RateLimitRule>;

const READ: RateLimitRule[] = [
  { name: 'tool-read', limit: 60, windowSec: MINUTE },
];
const TICKET_WRITE: RateLimitRule[] = [
  { name: 'tool-ticket-write', limit: 20, windowSec: MINUTE },
];
const CUSTOMER_WRITE: RateLimitRule[] = [
  { name: 'tool-customer-write', limit: 10, windowSec: MINUTE },
];

/**
 * Per-user limits for each tool. A tool may have several rules (all must pass):
 * issue_refund is limited per minute AND per day.
 * Record<ToolName, ...> forces a rule for every tool: add a tool, and this file
 * won't compile until you decide its limit.
 */
export const TOOL_LIMITS: Record<ToolName, RateLimitRule[]> = {
  find_customer: READ,
  get_customer_account: READ,
  get_customer_invoices: READ,
  search_customer_tickets: READ,
  create_support_ticket: TICKET_WRITE,
  update_ticket: TICKET_WRITE,
  create_customer: CUSTOMER_WRITE,
  update_customer: CUSTOMER_WRITE,
  issue_refund: [
    { name: 'tool-refund-minute', limit: 5, windowSec: MINUTE },
    { name: 'tool-refund-day', limit: 30, windowSec: DAY },
  ],
};
