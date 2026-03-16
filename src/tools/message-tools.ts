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

export function registerMessageTools(server: McpServer, client: ZulipClient): void {
  // ─── Send Stream Message ──────────────────────────────────────────────────
  server.registerTool(
    'zulip_send_stream_message',
    {
      title: 'Send Stream Message',
      description: 'Send a message to a Zulip stream/channel topic',
      inputSchema: {
        stream: z.string().describe('Name of the stream/channel to send to'),
        topic: z.string().describe('Topic/thread within the stream'),
        content: z.string().min(1).describe('Message content (supports Zulip markdown)'),
      },
    },
    async ({ stream, topic, content }) => {
      try {
        const result = await client.sendMessage({ type: 'stream', to: stream, content, topic });
        return {
          content: [{ type: 'text' as const, text: `Message sent successfully. Message ID: ${result.id}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    }
  );

  // ─── Send Direct Message ──────────────────────────────────────────────────
  server.registerTool(
    'zulip_send_direct_message',
    {
      title: 'Send Direct Message',
      description: 'Send a direct/private message to one or more Zulip users',
      inputSchema: {
        to: z
          .union([z.string(), z.array(z.string())])
          .describe('Recipient email address(es) or user ID(s)'),
        content: z.string().min(1).describe('Message content (supports Zulip markdown)'),
      },
    },
    async ({ to, content }) => {
      try {
        const recipients = Array.isArray(to) ? to : [to];
        const result = await client.sendMessage({ type: 'direct', to: recipients, content });
        return {
          content: [{ type: 'text' as const, text: `Direct message sent successfully. Message ID: ${result.id}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    }
  );

  // ─── Update Message ───────────────────────────────────────────────────────
  server.registerTool(
    'zulip_update_message',
    {
      title: 'Update Message',
      description: 'Edit message content and/or move it to a different topic',
      inputSchema: {
        message_id: z.number().int().positive().describe('ID of the message to update'),
        content: z.string().optional().describe('New message content'),
        topic: z.string().optional().describe('New topic to move the message to'),
        propagate_mode: z
          .enum(['change_one', 'change_later', 'change_all'])
          .optional()
          .describe('When changing topic: change_one (this msg), change_later (this + newer), change_all (all msgs)'),
        send_notification_to_old_thread: z
          .boolean()
          .optional()
          .describe('Send automated notice to the old topic when moving messages'),
        send_notification_to_new_thread: z
          .boolean()
          .optional()
          .describe('Send automated notice to the new topic when moving messages'),
      },
    },
    async ({ message_id, content, topic, propagate_mode, send_notification_to_old_thread, send_notification_to_new_thread }) => {
      if (!content && !topic) {
        return {
          content: [{ type: 'text' as const, text: 'At least one of content or topic must be provided' }],
          isError: true,
        };
      }
      try {
        await client.updateMessage({
          messageId: message_id,
          content,
          topic,
          propagateMode: propagate_mode,
          sendNotificationToOldThread: send_notification_to_old_thread,
          sendNotificationToNewThread: send_notification_to_new_thread,
        });
        return {
          content: [{ type: 'text' as const, text: `Message ${message_id} updated successfully` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    }
  );

  // ─── Delete Message ───────────────────────────────────────────────────────
  server.registerTool(
    'zulip_delete_message',
    {
      title: 'Delete Message',
      description: 'Delete a message (requires admin or message owner permissions)',
      inputSchema: {
        message_id: z.number().int().positive().describe('ID of the message to delete'),
      },
    },
    async ({ message_id }) => {
      try {
        await client.deleteMessage(message_id);
        return {
          content: [{ type: 'text' as const, text: `Message ${message_id} deleted successfully` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    }
  );

  // ─── Get Message ──────────────────────────────────────────────────────────
  server.registerTool(
    'zulip_get_message',
    {
      title: 'Get Message',
      description: 'Fetch a single message by its ID',
      inputSchema: {
        message_id: z.number().int().positive().describe('ID of the message to fetch'),
      },
    },
    async ({ message_id }) => {
      try {
        const msg = await client.getMessageById(message_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(msg, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    }
  );

  // ─── Get Direct Messages ──────────────────────────────────────────────────
  server.registerTool(
    'zulip_get_direct_messages',
    {
      title: 'Get Direct Messages',
      description: 'Retrieve direct/private messages. Optionally filter to a conversation with a specific user.',
      inputSchema: {
        with: z
          .string()
          .optional()
          .describe('Email of the user to fetch conversation with. Omit to get all recent DMs.'),
        anchor: z
          .string()
          .optional()
          .default('newest')
          .describe('Message ID to anchor at, or "newest" / "oldest"'),
        num_before: z
          .number()
          .int()
          .min(0)
          .max(5000)
          .optional()
          .default(20)
          .describe('Number of messages before anchor to fetch'),
        num_after: z
          .number()
          .int()
          .min(0)
          .max(5000)
          .optional()
          .default(0)
          .describe('Number of messages after anchor to fetch'),
      },
    },
    async ({ with: withEmail, anchor, num_before, num_after }) => {
      try {
        const messages = await client.getDirectMessages({
          with: withEmail,
          anchor: anchor ?? 'newest',
          numBefore: num_before ?? 20,
          numAfter: num_after ?? 0,
        });

        const formatted = messages.map(m => ({
          id: m.id,
          sender: m.sender_full_name,
          email: m.sender_email,
          timestamp: new Date(m.timestamp * 1000).toISOString(),
          recipients: Array.isArray(m.display_recipient)
            ? (m.display_recipient as Array<{ email: string; full_name: string }>).map(r => r.full_name)
            : m.display_recipient,
          content: m.content,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: messages.length === 0
                ? 'No direct messages found'
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

  // ─── Search Messages ──────────────────────────────────────────────────────
  server.registerTool(
    'zulip_search_messages',
    {
      title: 'Search Messages',
      description: 'Search and retrieve messages with optional filters for stream, topic, sender, and keyword',
      inputSchema: {
        query: z.string().optional().describe('Keyword search query'),
        stream: z.string().optional().describe('Filter by stream name'),
        topic: z.string().optional().describe('Filter by topic name (requires stream)'),
        sender: z.string().optional().describe('Filter by sender email'),
        anchor: z
          .string()
          .optional()
          .default('newest')
          .describe('Message ID to anchor search at, or "newest" / "oldest"'),
        num_before: z
          .number()
          .int()
          .min(0)
          .max(5000)
          .optional()
          .default(20)
          .describe('Number of messages before anchor to fetch'),
        num_after: z
          .number()
          .int()
          .min(0)
          .max(5000)
          .optional()
          .default(0)
          .describe('Number of messages after anchor to fetch'),
      },
    },
    async ({ query, stream, topic, sender, anchor, num_before, num_after }) => {
      try {
        const narrow: Array<{ operator: string; operand: string }> = [];
        if (stream) narrow.push({ operator: 'stream', operand: stream });
        if (topic) narrow.push({ operator: 'topic', operand: topic });
        if (sender) narrow.push({ operator: 'sender', operand: sender });
        if (query) narrow.push({ operator: 'search', operand: query });

        const messages = await client.retrieveMessages({
          narrow: narrow as Parameters<typeof client.retrieveMessages>[0]['narrow'],
          anchor: anchor ?? 'newest',
          numBefore: num_before ?? 20,
          numAfter: num_after ?? 0,
        });

        const formatted = messages.map(m => ({
          id: m.id,
          sender: m.sender_full_name,
          email: m.sender_email,
          timestamp: new Date(m.timestamp * 1000).toISOString(),
          stream: m.display_recipient,
          topic: m.subject,
          content: m.content,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: messages.length === 0
                ? 'No messages found matching the criteria'
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
