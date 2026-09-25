import type { RequestContext } from '../gateway/context';
import type { Services } from '../services/index';

/**
 * What every tool receives when it is registered. A fresh MCP server is built
 * per request (stateless mode), so the request context is known up front.
 */
export interface ToolDeps {
  services: Services;
  ctx: RequestContext;
}
