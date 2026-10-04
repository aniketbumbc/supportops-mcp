import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/shell/brand';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { ProjectFlow } from './project-flow';
import { RefundFlow } from './refund-flow';

export const metadata = { title: 'How it works' };

const STATS = [
  { value: '9', label: 'MCP tools' },
  { value: '4', label: 'Roles with limits' },
  { value: '100%', label: 'Refunds confirmed by a person' },
];

const STACK: { group: string; items: string[] }[] = [
  { group: 'Frontend', items: ['Next.js 16', 'React 19', 'Tailwind CSS 4', 'Vercel AI SDK'] },
  { group: 'AI', items: ['OpenAI', 'Model Context Protocol', 'MCP TypeScript SDK'] },
  { group: 'Backend', items: ['Node.js 22', 'Fastify 5', 'Zod', 'Pino'] },
  { group: 'Data', items: ['PostgreSQL', 'Drizzle ORM', 'Redis'] },
  { group: 'Security', items: ['JWT (RS256)', 'argon2', 'Role policies', 'Audit log'] },
  { group: 'Deploy', items: ['Docker Compose', 'Caddy', 'VPS'] },
];

const TOOLS = [
  'find_customer',
  'get_customer_account',
  'get_customer_invoices',
  'search_customer_tickets',
  'create_customer',
  'update_customer',
  'create_support_ticket',
  'update_ticket',
  'issue_refund',
];

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <span className="text-[11px] font-semibold tracking-wider text-ledger uppercase">{eyebrow}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * One screen on laptops and desktops (lg and up): two columns, no page scroll.
 * Smaller screens stack the sections and scroll normally.
 */
export default function HowItWorksPage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-paper lg:h-screen">
      {/* Backdrop: faint grid with a green glow */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-160 bg-[linear-gradient(to_right,var(--color-rule)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-rule)_1px,transparent_1px)] bg-size-[40px_40px] opacity-40 mask-[radial-gradient(ellipse_at_top,black_10%,transparent_70%)]"
      />
      <div aria-hidden className="absolute -top-48 left-1/4 -z-10 size-140 rounded-full bg-ledger/15 blur-3xl" />

      <header className="shrink-0 border-b border-rule/70 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2.5 lg:px-10">
          <Link href="/login" className="rounded-lg focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none">
            <Brand />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft transition hover:border-ledger/40 hover:text-ledger focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
            >
              <ArrowLeft aria-hidden className="size-3.5" /> Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Falls back to scrolling inside the content area only if the window is very short */}
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-6 py-8 lg:min-h-0 lg:grid-cols-2 lg:gap-14 lg:overflow-y-auto lg:px-10">
        {/* Left: intro, project flow, tools */}
        <div className="flex flex-col gap-8">
          <div className="motion-safe:animate-fade-up">
            <h1 className="mt-2.5 text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
              From a question to a <span className="text-ledger">confirmed refund</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
              An AI support assistant for support and finance teams. Ask in plain language; it finds customers,
              invoices and tickets and prepares refunds. The same tools work in Cursor and Claude Code over MCP.
            </p>
            <dl className="mt-4 flex divide-x divide-rule">
              {STATS.map((s) => (
                <div key={s.label} className="flex flex-col-reverse pr-5 pl-5 first:pl-0">
                  <dt className="text-[11px] leading-snug text-ink-soft">{s.label}</dt>
                  <dd className="text-xl font-semibold tracking-tight text-ledger">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Section eyebrow="How it works" title="Project flow">
            <ProjectFlow />
          </Section>

          <Section eyebrow="Role-checked" title="MCP tools">
            <ul className="flex flex-wrap gap-1.5">
              {TOOLS.map((t) => (
                <li key={t}>
                  <code className="rounded-md bg-ink/5 px-2 py-0.5 text-xs text-ink">{t}</code>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Right: refund flow, tech stack */}
        <div className="flex flex-col gap-8">
          <Section eyebrow="Human in the loop" title="Refund flow">
            <RefundFlow />
          </Section>

          <Section eyebrow="Built with" title="Tech stack">
            <div className="relative grid gap-x-6 gap-y-2.5 overflow-hidden rounded-2xl border border-ledger/25 bg-ledger-tint/60 p-6 shadow-[0_24px_60px_-32px_var(--color-ledger)] sm:grid-cols-2">
              <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-ledger" />
              {STACK.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[11px] font-semibold tracking-wider text-ledger uppercase">{group}</p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {items.map((item) => (
                      <li
                        key={item}
                        className="rounded-full border border-rule bg-surface px-2.5 py-0.5 text-xs transition hover:border-ledger/40 hover:text-ledger"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </main>

      <footer className="shrink-0 border-t border-rule">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-2.5 text-xs text-ink-soft lg:px-10">
          <span>Enterprise SupportOps</span>
          <span>
            Developed by{' '}
            <a
              href="https://www.aniketbdev.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ledger hover:underline"
            >
              Aniket B Dev
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
