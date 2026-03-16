export interface ZulipStream {
  stream_id: number;
  name: string;
  description: string;
  invite_only: boolean;
  is_archived: boolean;
  is_web_public: boolean;
  history_public_to_subscribers: boolean;
}

export interface ZulipTopic {
  max_id: number;
  name: string;
}

export interface ZulipMessage {
  id: number;
  sender_id: number;
  sender_email: string;
  sender_full_name: string;
  content: string;
  content_type: string;
  timestamp: number;
  stream_id?: number;
  subject?: string;
  topic?: string;
  type: 'stream' | 'direct' | 'private';
  reactions: ZulipReaction[];
  flags: string[];
  display_recipient?: string | ZulipRecipient[];
}

export interface ZulipReaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: string;
  user_id: number;
}

export interface ZulipRecipient {
  id: number;
  email: string;
  full_name: string;
}

export interface ZulipUser {
  user_id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  is_bot: boolean;
  is_admin: boolean;
  is_guest: boolean;
  avatar_url: string;
  date_joined: string;
  timezone: string;
  role: number;
}

export interface ZulipPresence {
  website?: {
    status: 'active' | 'idle';
    timestamp: number;
    client: string;
    pushable: boolean;
  };
  aggregated?: {
    status: 'active' | 'idle';
    timestamp: number;
    client: string;
  };
}

export interface ZulipSubscription extends ZulipStream {
  color: string;
  audible_notifications: boolean;
  desktop_notifications: boolean;
  email_notifications: boolean;
  pin_to_top: boolean;
  in_home_view: boolean;
  is_muted: boolean;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type ZulipErrorCode =
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'STREAM_DOES_NOT_EXIST'
  | 'BAD_REQUEST'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export class ZulipError extends Error {
  constructor(
    public code: ZulipErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ZulipError';
  }
}
