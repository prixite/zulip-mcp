import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZulipClient } from '../zulip-client.js';
import { ZulipError } from '../types.js';

function formatError(err: unknown): string {
  if (err instanceof ZulipError) {
    return `Zulip API error [${err.code}]: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function registerUserTools(server: McpServer, client: ZulipClient): void {
  // ─── List Users ───────────────────────────────────────────────────────────
  server.registerTool(
    'zulip_list_users',
    {
      title: 'List Users',
      description: 'List all users (members) in the Zulip organization. Optionally filter to active-only or exclude bots.',
      inputSchema: {
        active_only: z
          .boolean()
          .optional()
          .default(true)
          .describe('Only return active (non-deactivated) users. Default: true'),
        exclude_bots: z
          .boolean()
          .optional()
          .default(true)
          .describe('Exclude bot accounts. Default: true'),
      },
    },
    async ({ active_only, exclude_bots }) => {
      try {
        let users = await client.retrieveUsers();

        if (active_only ?? true) {
          users = users.filter(u => u.is_active);
        }
        if (exclude_bots ?? true) {
          users = users.filter(u => !u.is_bot);
        }

        const formatted = users.map(u => ({
          user_id: u.user_id,
          full_name: u.full_name,
          email: u.email,
          is_admin: u.is_admin,
          is_guest: u.is_guest,
          date_joined: u.date_joined,
          timezone: u.timezone,
        }));

        // Sort by full name for readability
        formatted.sort((a, b) => a.full_name.localeCompare(b.full_name));

        return {
          content: [
            {
              type: 'text' as const,
              text: formatted.length === 0
                ? 'No users found'
                : JSON.stringify(formatted, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    }
  );
}
