import type { Role } from '@/lib/api/auth';

/** Sidebar entries and who may see them. Pages ALSO check roles on the server. */
export const NAV_ITEMS = [
  { href: '/chat', label: 'Chat', icon: 'chat', roles: null },
  {
    href: '/approvals',
    label: 'Approvals',
    icon: 'approvals',
    roles: ['support_lead', 'finance', 'admin'],
  },
  { href: '/tokens', label: 'Access tokens', icon: 'tokens', roles: null },
  { href: '/audit', label: 'Audit log', icon: 'audit', roles: ['admin'] },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: string;
  roles: readonly Role[] | null;
}[];

export type NavItem = (typeof NAV_ITEMS)[number];

export const ROLE_LABELS: Record<Role, string> = {
  support_agent: 'Support agent',
  support_lead: 'Support lead',
  finance: 'Finance',
  admin: 'Admin',
};

export function navItemsFor(roles: Role[]): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.roles === null || item.roles.some((r) => roles.includes(r)),
  );
}
