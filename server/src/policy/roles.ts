/** Every role the system knows. Must match platform.role_policies and docs/tool-contract.md. */
export const ROLES = [
  'support_agent',
  'support_lead',
  'finance',
  'admin',
] as const;

export type Role = (typeof ROLES)[number];
