import type { RequestContext } from '../gateway/context.js';
import type { EffectivePolicy } from '../policy/role-policy-store.js';
import type { Services } from '../services/index.js';

/**
 * What every tool receives when it is registered. A fresh MCP server is built
 * per request (stateless mode), so the caller and their permissions are known up front.
 */
export interface ToolDeps {
  services: Services;
  ctx: RequestContext;
  /** What the caller's roles allow: tools and refund limits. */
  policy: EffectivePolicy;
}
