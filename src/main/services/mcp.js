// "Connect Claude, Codex, your own agent": a local MCP server exposing Maya's tools. Localhost only.
import http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export const MCP_PORT = 3917;

export function startMcp({ tools, ctx, onCall = () => {} }) {
  const make = () => {
    const server = new Server({ name: 'ather', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      if (ctx.isLocked?.()) return { isError: true, content: [{ type: 'text', text: 'Maya is locked with a PIN.' }] };
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return { isError: true, content: [{ type: 'text', text: `Unknown tool ${params.name}` }] };
      try {
        if (tool.confirm && !(await ctx.services?.confirm?.({ name: tool.name, args: params.arguments || {} }))) {
          return { isError: true, content: [{ type: 'text', text: 'The user did not allow this action.' }] };
        }
        const result = await tool.run(params.arguments || {}, ctx);
        onCall(params.name, result);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    });
    return server;
  };

  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    let body;
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try { body = JSON.parse(Buffer.concat(chunks).toString() || 'null'); } catch { res.writeHead(400).end('Bad JSON'); return; }
    }
    // Stateless mode: a fresh server + transport per request.
    const server = make();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  httpServer.listen(MCP_PORT, '127.0.0.1');
  return { url: `http://127.0.0.1:${MCP_PORT}/mcp`, close: () => httpServer.close() };
}
