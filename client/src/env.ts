import 'server-only';
import { z } from 'zod';

/**
 * Server-side configuration, validated once at startup.
 * 'server-only' makes the build fail if a browser component ever imports this,
 * so secrets like OPENAI_API_KEY can never reach the client bundle.
 * (Only variables prefixed NEXT_PUBLIC_ are ever sent to the browser; we use none.)
 */
const EnvSchema = z.object({
  /** Where the MCP server (and its /auth, /approvals routes) runs. */
  MCP_SERVER_URL: z.url().default('http://localhost:4000'),
  /** OpenAI key for the chat agent. Never sent to the browser. */
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  /** Which OpenAI model the agent uses, e.g. one of your account's chat models. */
  OPENAI_MODEL: z.string().min(1, 'OPENAI_MODEL is required'),
  /** Name of the httpOnly cookie that holds the login token. */
  SESSION_COOKIE_NAME: z.string().min(1).default('crm_session'),
  /** Maximum tool calls the agent may make in one chat turn. */
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(8),
  /**
   * The MCP URL people put in Cursor / Claude (shown on the tokens page).
   * Defaults to MCP_SERVER_URL + /mcp; set it when users reach the server at a
   * different address, e.g. https://api.example.com/mcp behind a proxy.
   */
  PUBLIC_MCP_URL: z.url().optional(),
  /**
   * Same value as DEMO_SECRET in server/.env. Lets the "Try demo" button call
   * POST /auth/demo. Unset = the demo button can't sign anyone in.
   */
  DEMO_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(32).optional(),
  ),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid client environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const env = loadEnv();
