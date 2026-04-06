# zulip-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Zulip](https://zulip.com), enabling AI agents (Claude, etc.) to read and interact with Zulip streams, messages, and direct messages.

## Features

- **Send & manage messages** — stream messages, direct messages, edit, delete
- **Search messages** — by stream, topic, sender, keyword, or unread status (`is:unread`)
- **Read direct messages** — list all DMs or fetch a conversation with a specific user
- **Stream management** — subscribe, unsubscribe, create streams, list topics
- **Reactions & flags** — add/remove emoji reactions, mark messages read, update flags
- **Resources** — read-only access to streams, subscriptions, users, presence, and DMs

## Tools

| Tool | Description |
|------|-------------|
| `zulip_send_stream_message` | Send a message to a stream/topic |
| `zulip_send_direct_message` | Send a DM to one or more users |
| `zulip_get_direct_messages` | Retrieve DMs (all or with a specific user) |
| `zulip_update_message` | Edit a message or move it to another topic |
| `zulip_delete_message` | Delete a message |
| `zulip_get_message` | Fetch a single message by ID |
| `zulip_search_messages` | Search messages by stream, topic, sender, keyword, or unread status |
| `zulip_subscribe_to_stream` | Subscribe to a stream (creates it if needed) |
| `zulip_unsubscribe_from_stream` | Unsubscribe from a stream |
| `zulip_create_stream` | Create a new stream |
| `zulip_list_streams` | List subscribed or all public streams |
| `zulip_get_stream_topics` | List topics in a stream |
| `zulip_list_users` | List all users in the organization |
| `zulip_add_reaction` | Add an emoji reaction to a message |
| `zulip_remove_reaction` | Remove an emoji reaction |
| `zulip_update_message_flags` | Bulk-update message flags |
| `zulip_mark_messages_as_read` | Mark messages as read |

## Resources

| URI | Description |
|-----|-------------|
| `zulip://streams` | All streams |
| `zulip://me/subscriptions` | Current user's subscriptions |
| `zulip://streams/{id}/topics` | Topics in a stream |
| `zulip://streams/{id}/messages/{topic}` | Messages in a stream topic |
| `zulip://users` | All users |
| `zulip://me/profile` | Authenticated user's profile |
| `zulip://me/direct-messages` | Recent direct messages |
| `zulip://me/direct-messages/{email}` | DM conversation with a specific user |
| `zulip://users/{id}` | Specific user's profile |
| `zulip://users/{id}/presence` | User presence/status |

## Setup

### 1. Get Zulip API credentials

1. Log in to your Zulip organization
2. Go to **Settings → Your account → API key**
3. Copy your email and API key

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
ZULIP_USERNAME=yourbot@your-org.zulipchat.com
ZULIP_API_KEY=your_api_key_here
ZULIP_REALM=https://your-org.zulipchat.com
```

### 3. Build

```bash
npm install
npm run build
```

### 4. Configure Claude Desktop (or other MCP client)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zulip": {
      "command": "node",
      "args": ["/path/to/zulip-mcp/dist/index.js"],
      "env": {
        "ZULIP_USERNAME": "yourbot@your-org.zulipchat.com",
        "ZULIP_API_KEY": "your_api_key_here",
        "ZULIP_REALM": "https://your-org.zulipchat.com"
      }
    }
  }
}
```

Or if installed globally via npm:

```json
{
  "mcpServers": {
    "zulip": {
      "command": "zulip-mcp",
      "env": {
        "ZULIP_USERNAME": "yourbot@your-org.zulipchat.com",
        "ZULIP_API_KEY": "your_api_key_here",
        "ZULIP_REALM": "https://your-org.zulipchat.com"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZULIP_USERNAME` | Yes | — | Bot/user email address |
| `ZULIP_API_KEY` | Yes | — | Zulip API key |
| `ZULIP_REALM` | Yes | — | Zulip server URL (e.g. `https://your-org.zulipchat.com`) |
| `ZULIP_REQUEST_TIMEOUT_MS` | No | `20000` | HTTP request timeout in milliseconds |
| `ZULIP_MAX_RETRIES` | No | `3` | Max retries on transient errors |

## Development

```bash
npm run dev   # run with tsx (no build step)
npm run build # compile TypeScript to dist/
```

## License

MIT
