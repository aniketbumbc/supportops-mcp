import 'server-only';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import type { CurrentUser } from '@/lib/api/auth';
import type { McpSession } from '@/lib/mcp/mcp-client';
import { buildInstructions } from './prompt';
import { buildAgentTools } from './tools';

export interface RunAgentOptions {
  model: LanguageModel;
  mcp: McpSession;
  user: CurrentUser;
  messages: UIMessage[];
  maxSteps: number;
  abortSignal?: AbortSignal;
  /** Called exactly once when the run ends for any reason (finish, error, abort). */
  onEnd: () => void;
}

/**
 * One chat turn: the model may call the user's MCP tools, at most `maxSteps` times,
 * then answers. Kept separate from the HTTP route so it can be tested with a mock model.
 */
export async function runAgent(options: RunAgentOptions) {
  const { model, mcp, user, messages, maxSteps, abortSignal } = options;
  const toolInfos = await mcp.listTools();
  const tools = buildAgentTools(mcp, toolInfos);

  let ended = false;
  const end = () => {
    if (!ended) {
      ended = true;
      options.onEnd();
    }
  };

  return streamText({
    model,
    instructions: buildInstructions(
      user,
      toolInfos.map((t) => t.name),
    ),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    onFinish: end,
    onError: end,
    onAbort: end,
  });
}
