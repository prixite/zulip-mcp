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

export function registerReactionTools(server: McpServer, client: ZulipClient): void {
  // ─── Add Reaction ─────────────────────────────────────────────────────────
  server.registerTool(
    'zulip_add_reaction',
    {
      title: 'Add Reaction',
      description: 'Add an emoji reaction to a message',
      inputSchema: {
        message_id: z.number().int().positive().describe('ID of the message to react to'),
        emoji_name: z.string().describe('Emoji name (e.g., "thumbs_up", "heart", "+1")'),
        emoji_code: z
          .string()
          .optional()
          .describe('Unicode code point or realm emoji ID (optional; resolved from name if omitted)'),
        reaction_type: z
          .enum(['unicode_emoji', 'realm_emoji', 'zulip_extra_emoji'])
          .optional()
          .default('unicode_emoji')
          .describe('Type of emoji'),
      },
    },
    async ({ message_id, emoji_name, emoji_code, reaction_type }) => {
      try {
        await client.addReaction(message_id, emoji_name, emoji_code, reaction_type);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Reaction :${emoji_name}: added to message ${message_id}`,
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

  // ─── Remove Reaction ──────────────────────────────────────────────────────
  server.registerTool(
    'zulip_remove_reaction',
    {
      title: 'Remove Reaction',
      description: 'Remove an emoji reaction from a message',
      inputSchema: {
        message_id: z.number().int().positive().describe('ID of the message'),
        emoji_name: z.string().describe('Emoji name to remove'),
        emoji_code: z.string().optional().describe('Emoji code (optional)'),
        reaction_type: z.string().optional().describe('Reaction type (optional)'),
      },
    },
    async ({ message_id, emoji_name, emoji_code, reaction_type }) => {
      try {
        await client.removeReaction(message_id, emoji_name, emoji_code, reaction_type);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Reaction :${emoji_name}: removed from message ${message_id}`,
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

  // ─── Update Message Flags ─────────────────────────────────────────────────
  server.registerTool(
    'zulip_update_message_flags',
    {
      title: 'Update Message Flags',
      description: 'Add or remove flags (read, starred, etc.) on messages',
      inputSchema: {
        messages: z
          .array(z.number().int().positive())
          .min(1)
          .describe('List of message IDs to update'),
        flag: z
          .enum(['read', 'starred', 'mentioned', 'wildcard_mentioned', 'has_alert_word', 'historical'])
          .describe('Flag to add or remove'),
        op: z.enum(['add', 'remove']).describe('Whether to add or remove the flag'),
      },
    },
    async ({ messages, flag, op }) => {
      try {
        const updated = await client.updateMessageFlags(messages, flag, op);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Flag "${flag}" ${op === 'add' ? 'added to' : 'removed from'} ${updated.length} message(s)`,
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

  // ─── Mark Messages as Read ────────────────────────────────────────────────
  server.registerTool(
    'zulip_mark_messages_as_read',
    {
      title: 'Mark Messages as Read',
      description: 'Mark one or more messages as read',
      inputSchema: {
        messages: z
          .array(z.number().int().positive())
          .min(1)
          .describe('List of message IDs to mark as read'),
      },
    },
    async ({ messages }) => {
      try {
        const updated = await client.updateMessageFlags(messages, 'read', 'add');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Marked ${updated.length} message(s) as read`,
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
