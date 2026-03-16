import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZulipClient } from '../zulip-client.js';

export function registerUserResources(server: McpServer, client: ZulipClient): void {
  // ─── All Users ────────────────────────────────────────────────────────────
  server.registerResource(
    'zulip-users',
    'zulip://users',
    {
      title: 'Zulip Users',
      description: 'All users in the Zulip realm',
      mimeType: 'application/json',
    },
    async (_uri) => {
      const users = await client.retrieveUsers();
      return {
        contents: [
          {
            uri: 'zulip://users',
            mimeType: 'application/json',
            text: JSON.stringify(
              users.map(u => ({
                user_id: u.user_id,
                email: u.email,
                full_name: u.full_name,
                is_active: u.is_active,
                is_bot: u.is_bot,
                is_admin: u.is_admin,
                timezone: u.timezone,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── My Profile ───────────────────────────────────────────────────────────
  server.registerResource(
    'zulip-my-profile',
    'zulip://me/profile',
    {
      title: 'My Profile',
      description: 'The authenticated bot/user profile',
      mimeType: 'application/json',
    },
    async (_uri) => {
      const profile = await client.getMyProfile();
      return {
        contents: [
          {
            uri: 'zulip://me/profile',
            mimeType: 'application/json',
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    }
  );

  // ─── User Profile ─────────────────────────────────────────────────────────
  const userTemplate = new ResourceTemplate('zulip://users/{user_id}', {
    list: async () => {
      const users = await client.retrieveUsers();
      return {
        resources: users
          .filter(u => u.is_active && !u.is_bot)
          .map(u => ({
            uri: `zulip://users/${u.user_id}`,
            name: u.full_name,
            description: `Profile for ${u.full_name} (${u.email})`,
            mimeType: 'application/json',
          })),
      };
    },
  });

  server.registerResource(
    'zulip-user-profile',
    userTemplate,
    {
      title: 'User Profile',
      description: 'Profile information for a specific user',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const userId = parseInt(String(vars.user_id), 10);
      if (isNaN(userId)) {
        throw new Error(`Invalid user_id: ${vars.user_id}`);
      }
      const user = await client.getUserById(userId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(user, null, 2),
          },
        ],
      };
    }
  );

  // ─── Direct Messages ──────────────────────────────────────────────────────
  server.registerResource(
    'zulip-my-direct-messages',
    'zulip://me/direct-messages',
    {
      title: 'My Direct Messages',
      description: 'Recent direct/private messages for the authenticated user',
      mimeType: 'application/json',
    },
    async (_uri) => {
      const messages = await client.getDirectMessages({ numBefore: 20 });
      return {
        contents: [
          {
            uri: 'zulip://me/direct-messages',
            mimeType: 'application/json',
            text: JSON.stringify(
              messages.map(m => ({
                id: m.id,
                sender: m.sender_full_name,
                email: m.sender_email,
                timestamp: new Date(m.timestamp * 1000).toISOString(),
                recipients: Array.isArray(m.display_recipient)
                  ? (m.display_recipient as Array<{ email: string; full_name: string }>).map(r => r.full_name)
                  : m.display_recipient,
                content: m.content,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const dmTemplate = new ResourceTemplate('zulip://me/direct-messages/{email}', {
    list: async () => {
      const users = await client.retrieveUsers();
      return {
        resources: users
          .filter(u => u.is_active && !u.is_bot)
          .map(u => ({
            uri: `zulip://me/direct-messages/${encodeURIComponent(u.email)}`,
            name: u.full_name,
            description: `DM conversation with ${u.full_name}`,
            mimeType: 'application/json',
          })),
      };
    },
  });

  server.registerResource(
    'zulip-dm-conversation',
    dmTemplate,
    {
      title: 'DM Conversation',
      description: 'Direct message conversation with a specific user',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const email = decodeURIComponent(String(vars.email));
      const messages = await client.getDirectMessages({ with: email, numBefore: 50 });
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
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── User Presence ────────────────────────────────────────────────────────
  const presenceTemplate = new ResourceTemplate('zulip://users/{user_id}/presence', {
    list: undefined,
  });

  server.registerResource(
    'zulip-user-presence',
    presenceTemplate,
    {
      title: 'User Presence',
      description: 'Online/away presence status for a user',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const userId = String(vars.user_id);
      const presence = await client.getUserPresence(userId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(presence, null, 2),
          },
        ],
      };
    }
  );
}
