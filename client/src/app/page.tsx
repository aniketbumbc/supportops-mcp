import { env } from '@/env';

/** Temporary home page for Step 1: proves the app runs and the env is valid. */
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">SupportOps</h1>
        <p className="mt-2 text-sm text-slate-600">
          AI support assistant for customers, invoices, tickets and refunds.
        </p>
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">MCP server</dt>
            <dd className="font-mono text-slate-900">{env.MCP_SERVER_URL}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Model</dt>
            <dd className="font-mono text-slate-900">{env.OPENAI_MODEL}</dd>
          </div>
        </dl>
        <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Tailwind is working and the environment is valid.
        </p>
      </div>
    </main>
  );
}