import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { normalizeError } from '../errors/index.js';
import { createRequestContext, resolveIdentity } from '../gateway/context';
import type { Services } from '../services/index';
import { registerTools } from '../tools/index';

export const SERVER_INFO = {
  name: 'enterprise-crm-mcp',
  version: '0.1.0',
} as const;

/** JSON-RPC error body, the format MCP clients expect even for HTTP-level failures. */
const rpcError = (code: number, message: string) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null,
});

/** Pulls the JSON-RPC method (and tool name) out of a request body, for logging. */
function describeRpc(body: unknown): { rpcMethod?: string; tool?: string } {
  const msg = (Array.isArray(body) ? body[0] : body) as
    { method?: string; params?: { name?: string } } | undefined;
  return {
    rpcMethod: msg?.method,
    tool: msg?.method === 'tools/call' ? msg.params?.name : undefined,
  };
}

/**
 * MCP over Streamable HTTP, STATELESS mode.
 *
 * Every POST /mcp gets a brand-new McpServer + transport, built for the caller:
 * the request context (who, correlation ID) is known before tools are registered,
 * and nothing is shared between users or requests. No sessions to store, so any
 * number of server instances can run behind a load balancer.
 *
 * Trade-off: without sessions the server cannot send requests back to the client
 * mid-call (e.g. MCP elicitation). Phase 6 handles refund confirmation with that
 * in mind.
 */
export function registerMcpRoutes(
  app: FastifyInstance,
  deps: { services: Services },
): void {
  app.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.id;

    let ctx;
    try {
      ctx = createRequestContext(
        correlationId,
        resolveIdentity(request.headers),
      );
    } catch (error) {
      const appError = normalizeError(error);
      request.log.warn(
        { code: appError.code },
        'MCP request rejected: identity',
      );
      return reply.status(401).send(rpcError(-32001, appError.message));
    }

    const server = new McpServer(SERVER_INFO);
    registerTools(server, { services: deps.services, ctx });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true, // plain JSON replies instead of an SSE stream
    });

    // The SDK writes directly to Node's response, so Fastify must step aside.
    reply.hijack();
    reply.raw.setHeader('x-request-id', correlationId);
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    const started = Date.now();
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      ctx.log.info(
        {
          ...describeRpc(request.body),
          status: reply.raw.statusCode,
          durationMs: Date.now() - started,
        },
        'MCP request',
      );
    } catch (error) {
      ctx.log.error(
        { err: error, ...describeRpc(request.body) },
        'MCP transport failure',
      );
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' });
        reply.raw.end(
          JSON.stringify(rpcError(-32603, 'Internal server error')),
        );
      }
    }
  });

  // Stateless mode has no server-initiated stream (GET) and no sessions to end (DELETE).
  //It rejects the two HTTP methods your MCP endpoint doesn't support,
  //**Some MCP clients try GET /mcp automatically to open a stream. Without this,
  // they'd get a generic Fastify 404, which looks like "the server doesn't exist".
  // With it, they get a proper "use POST" answer and continue normally with POST only. */
  const notAllowed = async (_request: FastifyRequest, reply: FastifyReply) =>
    reply
      .status(405)
      .header('allow', 'POST')
      .send(rpcError(-32000, 'Method not allowed.'));
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}
