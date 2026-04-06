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

export function registerStreamTools(server: McpServer, client: ZulipClient): void {
  // ─── Subscribe to Stream ──────────────────────────────────────────────────
  server.registerTool(
    'zulip_subscribe_to_stream',
    {
      title: 'Subscribe to Stream',
      description: 'Subscribe to a Zulip stream. Creates the stream if it does not exist.',
      inputSchema: {
        stream_name: z.string().describe('Name of the stream to subscribe to'),
        description: z.string().optional().describe('Stream description (used when creating a new stream)'),
        invite_only: z
          .boolean()
          .optional()
          .default(false)
          .describe('Make the stream private/invite-only (used when creating a new stream)'),
        announce: z
          .boolean()
          .optional()
          .describe('Announce the new stream in the #stream-events topic (used when creating)'),
      },
    },
    async ({ stream_name, description, invite_only, announce }) => {
      try {
        const result = await client.subscribeToStreams(
          [{ name: stream_name, description, inviteOnly: invite_only ?? false }],
          { announce, inviteOnly: invite_only ?? false }
        );

        const wasSubscribed = Object.values(result.subscribed).flat().length > 0;
        const wasAlready = Object.values(result.alreadySubscribed).flat().length > 0;

        const statusMsg = wasAlready
          ? `Already subscribed to "${stream_name}"`
          : wasSubscribed
          ? `Successfully subscribed to "${stream_name}"`
          : `Subscribed to "${stream_name}"`;

        return {
          content: [{ type: 'text' as const, text: statusMsg }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    }
  );

  // ─── Unsubscribe from Stream ──────────────────────────────────────────────
  server.registerTool(
    'zulip_unsubscribe_from_stream',
    {
      title: 'Unsubscribe from Stream',
      description: 'Unsubscribe from one or more Zulip streams',
      inputSchema: {
        stream_names: z
          .array(z.string())
          .min(1)
          .describe('List of stream names to unsubscribe from'),
      },
    },
    async ({ stream_names }) => {
      try {
        await client.unsubscribeFromStreams(stream_names);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Successfully unsubscribed from: ${stream_names.join(', ')}`,
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

  // ─── Create Stream ────────────────────────────────────────────────────────
  server.registerTool(
    'zulip_create_stream',
    {
      title: 'Create Stream',
      description: 'Create a new Zulip stream/channel and subscribe to it',
      inputSchema: {
        name: z.string().describe('Name for the new stream'),
        description: z.string().optional().describe('Description of the stream purpose'),
        invite_only: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether the stream should be private (invite-only)'),
        announce: z
          .boolean()
          .optional()
          .default(true)
          .describe('Announce the new stream in #stream-events'),
      },
    },
    async ({ name, description, invite_only, announce }) => {
      try {
        const result = await client.subscribeToStreams(
          [{ name, description, inviteOnly: invite_only ?? false }],
          { announce: announce ?? true, inviteOnly: invite_only ?? false }
        );

        const alreadyExisted = Object.values(result.alreadySubscribed).flat().length > 0;

        return {
          content: [
            {
              type: 'text' as const,
              text: alreadyExisted
                ? `Stream "${name}" already exists. You are now subscribed to it.`
                : `Stream "${name}" created successfully.`,
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

  // ─── List Streams ─────────────────────────────────────────────────────────
  server.registerTool(
    'zulip_list_streams',
    {
      title: 'List Streams',
      description: 'List Zulip streams. By default returns only subscribed streams. Can also return all public streams.',
      inputSchema: {
        subscribed_only: z
          .boolean()
          .optional()
          .default(true)
          .describe('Only return streams you are subscribed to. Default: true'),
        include_archived: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include archived streams. Default: false'),
      },
    },
    async ({ subscribed_only, include_archived }) => {
      try {
        const subscribedOnly = subscribed_only ?? true;
        const includeArchived = include_archived ?? false;

        let streams: import('../types.js').ZulipStream[];
        if (subscribedOnly) {
          streams = await client.retrieveSubscriptions();
        } else {
          streams = await client.retrieveStreams(true, true);
        }

        if (!includeArchived) {
          streams = streams.filter(s => !s.is_archived);
        }

        const formatted = streams
          .map(s => ({
            stream_id: s.stream_id,
            name: s.name,
            description: s.description,
            invite_only: s.invite_only,
            is_archived: s.is_archived,
            is_web_public: s.is_web_public,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          content: [
            {
              type: 'text' as const,
              text: formatted.length === 0
                ? 'No streams found'
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

  // ─── Get Stream Topics ────────────────────────────────────────────────────
  server.registerTool(
    'zulip_get_stream_topics',
    {
      title: 'Get Stream Topics',
      description: 'List all topics in a stream',
      inputSchema: {
        stream_name: z.string().describe('Name of the stream'),
      },
    },
    async ({ stream_name }) => {
      try {
        const streamId = await client.getStreamId(stream_name);
        const topics = await client.retrieveTopics(streamId);
        const sorted = [...topics].sort((a, b) => b.max_id - a.max_id);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                sorted.map(t => ({ name: t.name, last_message_id: t.max_id })),
                null,
                2
              ),
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
