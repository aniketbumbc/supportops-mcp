import { PageHeader } from '@/components/shell/page-header';
import { TokenCreator } from '@/components/tokens/token-creator';
import { TokenList } from '@/components/tokens/token-list';
import { env } from '@/env';
import { listTokens } from '@/lib/api';
import { getSessionToken, requireUser } from '@/lib/session';

export default async function TokensPage() {
  await requireUser();
  const tokens = await listTokens((await getSessionToken())!);
  const mcpUrl = env.PUBLIC_MCP_URL ?? new URL('/mcp', env.MCP_SERVER_URL).toString();

  return (
    <>
      <PageHeader title="Access tokens" description="Connect Cursor, Claude Code and other MCP clients." />
      <div className="max-w-3xl space-y-8 px-6 py-6 lg:px-10">
        <TokenCreator mcpUrl={mcpUrl} />
        <TokenList tokens={tokens} />
      </div>
    </>
  );
}