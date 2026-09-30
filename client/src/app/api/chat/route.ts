import { createOpenAI } from '@ai-sdk/openai';
import {
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { env } from '@/env';
import { runAgent } from '@/lib/agent/run';
import { ApiError, getMe } from '@/lib/api';
import { McpConnectionError, McpSession } from '@/lib/mcp/mcp-client';
import { getSessionToken } from '@/lib/session';

/** Chat can take a while when the model uses several tools. */
export const maxDuration = 60;

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 4000;

const json = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

/** Text of a UI message, for size checks. */
const textOf = (m: UIMessage) =>
  m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');

export async function POST(req: Request) {
  // 1. Who is asking. The API route answers 401 itself (the proxy skips /api).
  const token = await getSessionToken();
  if (!token)
    return json(401, 'UNAUTHENTICATED', 'Sign in to use the assistant.');
  let user;
  try {
    user = await getMe(token);
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) {
      return json(
        401,
        'UNAUTHENTICATED',
        'Your session has ended. Sign in again.',
      );
    }
    return json(
      503,
      'UNAVAILABLE',
      'The support server is not reachable right now.',
    );
  }

  // 2. Validate the request: bounded history and message size (cost and abuse control).
  let messages: UIMessage[];
  try {
    const body = (await req.json()) as { messages?: unknown };
    if (!Array.isArray(body.messages) || body.messages.length === 0)
      throw new Error();
    messages = (body.messages as UIMessage[]).slice(-MAX_MESSAGES);
  } catch {
    return json(400, 'BAD_REQUEST', 'Expected { messages: [...] }.');
  }
  const last = messages.at(-1)!;
  if (last.role !== 'user' || textOf(last).trim().length === 0) {
    return json(
      400,
      'BAD_REQUEST',
      'The last message must be a non-empty user message.',
    );
  }
  if (textOf(last).length > MAX_MESSAGE_CHARS) {
    return json(
      400,
      'MESSAGE_TOO_LONG',
      `Keep messages under ${MAX_MESSAGE_CHARS} characters.`,
    );
  }

  // 3. Connect to the MCP server as this user.
  let mcp: McpSession;
  try {
    mcp = await McpSession.open(token);
  } catch (error) {
    if (error instanceof McpConnectionError) {
      const status =
        error.kind === 'unauthenticated'
          ? 401
          : error.kind === 'rate_limited'
            ? 429
            : 503;
      return json(status, error.kind.toUpperCase(), error.message);
    }
    throw error;
  }

  // 4. Run the agent and stream the answer. The MCP connection closes when the run ends.
  try {
    const result = await runAgent({
      model: openai(env.OPENAI_MODEL),
      mcp,
      user,
      messages,
      maxSteps: env.AGENT_MAX_STEPS,
      abortSignal: req.signal,
      onEnd: () => void mcp.close(),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onError: (error) => {
          console.error('Chat stream error', error);
          if (error instanceof McpConnectionError) return error.message;
          return 'Something went wrong while answering. Please try again.';
        },
      }),
    });
  } catch (error) {
    await mcp.close();
    console.error('Chat failed to start', error);
    return json(
      500,
      'INTERNAL_ERROR',
      'The assistant could not start. Please try again.',
    );
  }
}
