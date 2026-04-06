#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, SERVER_NAME, SERVER_VERSION } from './config.js';
import { ZulipClient } from './zulip-client.js';
import { registerMessageTools } from './tools/message-tools.js';
import { registerStreamTools } from './tools/stream-tools.js';
import { registerReactionTools } from './tools/reaction-tools.js';
import { registerUserTools } from './tools/user-tools.js';
import { registerStreamResources } from './resources/stream-resources.js';
import { registerUserResources } from './resources/user-resources.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const client = new ZulipClient(config);

  // Eagerly verify credentials on startup
  try {
    await client.initialize();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to connect to Zulip: ${msg}\n`);
    process.exit(1);
  }

  // Register tools
  registerMessageTools(server, client);
  registerStreamTools(server, client);
  registerReactionTools(server, client);
  registerUserTools(server, client);

  // Register resources
  registerStreamResources(server, client);
  registerUserResources(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(`${SERVER_NAME} v${SERVER_VERSION} connected to ${config.realm}\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
