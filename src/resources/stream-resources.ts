import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZulipClient } from '../zulip-client.js';

export function registerStreamResources(server: McpServer, client: ZulipClient): void {
  // ─── All Streams ──────────────────────────────────────────────────────────
  server.registerResource(
    'zulip-streams',
    'zulip://streams',
    {
      title: 'Zulip Streams',
      description: 'All streams/channels in the Zulip realm',
      mimeType: 'application/json',
    },
    async (_uri) => {
      const streams = await client.retrieveStreams();
      return {
        contents: [
          {
            uri: 'zulip://streams',
            mimeType: 'application/json',
            text: JSON.stringify(
              streams.map(s => ({
                stream_id: s.stream_id,
                name: s.name,
                description: s.description,
                invite_only: s.invite_only,
                is_archived: s.is_archived,
                is_web_public: s.is_web_public,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── My Subscriptions ─────────────────────────────────────────────────────
  server.registerResource(
    'zulip-my-subscriptions',
    'zulip://me/subscriptions',
    {
      title: 'My Subscriptions',
      description: 'Streams the authenticated user is subscribed to',
      mimeType: 'application/json',
    },
    async (_uri) => {
      const subs = await client.retrieveSubscriptions();
      return {
        contents: [
          {
            uri: 'zulip://me/subscriptions',
            mimeType: 'application/json',
            text: JSON.stringify(
              subs.map(s => ({
                stream_id: s.stream_id,
                name: s.name,
                description: s.description,
                invite_only: s.invite_only,
                color: s.color,
                is_muted: s.is_muted,
                pin_to_top: s.pin_to_top,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Stream Topics ────────────────────────────────────────────────────────
  const topicsTemplate = new ResourceTemplate('zulip://streams/{stream_id}/topics', {
    list: async () => {
      const streams = await client.retrieveStreams();
      return {
        resources: streams.map(s => ({
          uri: `zulip://streams/${s.stream_id}/topics`,
          name: `Topics in #${s.name}`,
          description: `Topics in the "${s.name}" stream`,
          mimeType: 'application/json',
        })),
      };
    },
  });

  server.registerResource(
    'zulip-stream-topics',
    topicsTemplate,
    {
      title: 'Stream Topics',
      description: 'Topics/threads in a specific Zulip stream',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const streamId = parseInt(String(vars.stream_id), 10);
      if (isNaN(streamId)) {
        throw new Error(`Invalid stream_id: ${vars.stream_id}`);
      }
      const topics = await client.retrieveTopics(streamId);
      const sorted = [...topics].sort((a, b) => b.max_id - a.max_id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              sorted.map(t => ({ name: t.name, last_message_id: t.max_id })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Messages in Stream Topic ─────────────────────────────────────────────
  const messagesTemplate = new ResourceTemplate(
    'zulip://streams/{stream_id}/messages/{topic}',
    { list: undefined }
  );

  server.registerResource(
    'zulip-stream-messages',
    messagesTemplate,
    {
      title: 'Stream Topic Messages',
      description: 'Recent messages in a specific stream topic',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const streamId = parseInt(String(vars.stream_id), 10);
      const topic = decodeURIComponent(String(vars.topic));

      if (isNaN(streamId)) {
        throw new Error(`Invalid stream_id: ${vars.stream_id}`);
      }

      const messages = await client.retrieveMessages({
        narrow: [
          { operator: 'stream', operand: String(streamId) },
          { operator: 'topic', operand: topic },
        ],
        anchor: 'newest',
        numBefore: 50,
        numAfter: 0,
      });

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              messages.map(m => ({
                id: m.id,
                sender: m.sender_full_name,
                email: m.sender_email,
                timestamp: new Date(m.timestamp * 1000).toISOString(),
                content: m.content,
                reactions: m.reactions?.map(r => r.emoji_name) ?? [],
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
