import type { ZulipMcpConfig } from './config.js';
import {
  ZulipError,
  type ZulipErrorCode,
  type ZulipMessage,
  type ZulipStream,
  type ZulipSubscription,
  type ZulipTopic,
  type ZulipUser,
  type ZulipPresence,
} from './types.js';

interface ZulipApiResponse {
  result: 'success' | 'error';
  msg: string;
  code?: string;
  [key: string]: unknown;
}

export type NarrowOperator =
  | 'stream'
  | 'topic'
  | 'sender'
  | 'search'
  | 'is'
  | 'has'
  | 'near'
  | 'id'
  | 'dm';

export interface NarrowFilter {
  operator: NarrowOperator;
  operand: string;
  negated?: boolean;
}

export interface RetrieveMessagesParams {
  narrow?: NarrowFilter[];
  anchor?: string | number;
  numBefore?: number;
  numAfter?: number;
  includeAnchor?: boolean;
  applyMarkdown?: boolean;
}

export interface SendMessageParams {
  type: 'stream' | 'direct';
  to: string | number | (string | number)[];
  content: string;
  topic?: string;
  queueId?: string;
  localId?: string;
}

export interface UpdateMessageParams {
  messageId: number;
  content?: string;
  topic?: string;
  propagateMode?: 'change_one' | 'change_later' | 'change_all';
  sendNotificationToOldThread?: boolean;
  sendNotificationToNewThread?: boolean;
}

export interface SubscribeToStreamParams {
  name: string;
  description?: string;
  inviteOnly?: boolean;
  announce?: boolean;
}

export class ZulipClient {
  private baseUrl: string;
  private authHeader: string;
  private config: ZulipMcpConfig;

  constructor(config: ZulipMcpConfig) {
    this.config = config;
    // Remove trailing slash from realm
    this.baseUrl = config.realm.replace(/\/$/, '') + '/api/v1';
    // Basic auth: base64(username:apiKey)
    const credentials = Buffer.from(`${config.username}:${config.apiKey}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  async initialize(): Promise<void> {
    // Verify credentials by fetching own profile
    await this.getMyProfile();
  }

  private async request<T = unknown>(
    method: string,
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    const init: RequestInit = {
      method,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    };

    if (method === 'GET' || method === 'DELETE') {
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(
              key,
              typeof value === 'object' ? JSON.stringify(value) : String(value)
            );
          }
        }
      }
    } else {
      if (params) {
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            body.set(
              key,
              typeof value === 'object' ? JSON.stringify(value) : String(value)
            );
          }
        }
        init.body = body.toString();
      }
    }

    return this.withRetry(async () => {
      let response: Response;
      try {
        response = await fetch(url.toString(), init);
      } catch (err) {
        throw new ZulipError('NETWORK_ERROR', `Network error: ${err}`, err);
      }

      const data = (await response.json()) as ZulipApiResponse;

      if (data.result === 'error') {
        throw this.normalizeApiError(response.status, data);
      }

      return data as T;
    });
  }

  private normalizeApiError(status: number, data: ZulipApiResponse): ZulipError {
    let code: ZulipErrorCode = 'UNKNOWN_ERROR';
    if (status === 401 || status === 403) code = 'UNAUTHORIZED';
    else if (status === 404 || data.code === 'STREAM_DOES_NOT_EXIST') code = 'NOT_FOUND';
    else if (status === 429 || data.code === 'RATE_LIMIT_HIT') code = 'RATE_LIMITED';
    else if (status === 400) code = 'BAD_REQUEST';

    return new ZulipError(code, data.msg || 'Unknown Zulip API error', data);
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (err instanceof ZulipError) {
          if (err.code === 'RATE_LIMITED') {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            await new Promise(res => setTimeout(res, delay));
            continue;
          }
          // Don't retry auth or bad request errors
          if (err.code === 'UNAUTHORIZED' || err.code === 'BAD_REQUEST') {
            throw err;
          }
        }
        if (attempt < this.config.maxRetries) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise(res => setTimeout(res, delay));
        }
      }
    }
    throw lastError;
  }

  // ─── Messages ────────────────────────────────────────────────────────────

  async sendMessage(params: SendMessageParams): Promise<{ id: number }> {
    const body: Record<string, unknown> = {
      type: params.type,
      content: params.content,
    };

    if (params.type === 'stream') {
      body.to = typeof params.to === 'string' ? params.to : JSON.stringify(params.to);
      body.topic = params.topic ?? '(no topic)';
    } else {
      // direct message — to should be array of user IDs or emails
      const to = Array.isArray(params.to) ? params.to : [params.to];
      body.to = JSON.stringify(to);
    }

    const resp = await this.request<{ result: string; id: number }>('POST', '/messages', body);
    return { id: resp.id };
  }

  async updateMessage(params: UpdateMessageParams): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.content !== undefined) body.content = params.content;
    if (params.topic !== undefined) {
      body.topic = params.topic;
      body.propagate_mode = params.propagateMode ?? 'change_one';
      if (params.sendNotificationToOldThread !== undefined)
        body.send_notification_to_old_thread = params.sendNotificationToOldThread;
      if (params.sendNotificationToNewThread !== undefined)
        body.send_notification_to_new_thread = params.sendNotificationToNewThread;
    }
    await this.request('PATCH', `/messages/${params.messageId}`, body);
  }

  async deleteMessage(messageId: number): Promise<void> {
    await this.request('DELETE', `/messages/${messageId}`);
  }

  async getMessageById(messageId: number): Promise<ZulipMessage> {
    const resp = await this.request<{ result: string; message: ZulipMessage }>(
      'GET',
      `/messages/${messageId}`,
      { apply_markdown: false }
    );
    return resp.message;
  }

  async retrieveMessages(params: RetrieveMessagesParams): Promise<ZulipMessage[]> {
    const query: Record<string, unknown> = {
      anchor: params.anchor ?? 'newest',
      num_before: params.numBefore ?? 20,
      num_after: params.numAfter ?? 0,
      apply_markdown: params.applyMarkdown ?? false,
    };
    if (params.narrow && params.narrow.length > 0) {
      query.narrow = params.narrow;
    }
    const resp = await this.request<{ result: string; messages: ZulipMessage[]; found_newest: boolean }>(
      'GET',
      '/messages',
      query
    );
    return resp.messages;
  }

  // ─── Streams ──────────────────────────────────────────────────────────────

  async retrieveStreams(includePublic = true, includeSubscribed = true): Promise<ZulipStream[]> {
    const resp = await this.request<{ result: string; streams: ZulipStream[] }>(
      'GET',
      '/streams',
      {
        include_public: includePublic,
        include_subscribed: includeSubscribed,
      }
    );
    return resp.streams;
  }

  async getStreamId(streamName: string): Promise<number> {
    const resp = await this.request<{ result: string; stream_id: number }>(
      'GET',
      '/get_stream_id',
      { stream: streamName }
    );
    return resp.stream_id;
  }

  async retrieveTopics(streamId: number): Promise<ZulipTopic[]> {
    const resp = await this.request<{ result: string; topics: ZulipTopic[] }>(
      'GET',
      `/users/me/${streamId}/topics`
    );
    return resp.topics;
  }

  async retrieveSubscriptions(): Promise<ZulipSubscription[]> {
    const resp = await this.request<{ result: string; subscriptions: ZulipSubscription[] }>(
      'GET',
      '/users/me/subscriptions'
    );
    return resp.subscriptions;
  }

  async subscribeToStreams(
    subscriptions: SubscribeToStreamParams[],
    opts?: { announce?: boolean; inviteOnly?: boolean; historyPublicToSubscribers?: boolean }
  ): Promise<{ subscribed: Record<string, string[]>; alreadySubscribed: Record<string, string[]> }> {
    const body: Record<string, unknown> = {
      subscriptions: subscriptions.map(s => ({
        name: s.name,
        ...(s.description !== undefined ? { description: s.description } : {}),
      })),
    };
    if (opts?.announce !== undefined) body.announce = opts.announce;
    if (opts?.inviteOnly !== undefined) body.invite_only = opts.inviteOnly;
    if (opts?.historyPublicToSubscribers !== undefined)
      body.history_public_to_subscribers = opts.historyPublicToSubscribers;

    const resp = await this.request<{
      result: string;
      subscribed: Record<string, string[]>;
      already_subscribed: Record<string, string[]>;
    }>('POST', '/users/me/subscriptions', body);

    return { subscribed: resp.subscribed, alreadySubscribed: resp.already_subscribed };
  }

  async unsubscribeFromStreams(streamNames: string[]): Promise<void> {
    await this.request('DELETE', '/users/me/subscriptions', {
      subscriptions: streamNames,
    });
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  async retrieveUsers(): Promise<ZulipUser[]> {
    const resp = await this.request<{ result: string; members: ZulipUser[] }>('GET', '/users', {
      include_custom_profile_fields: false,
    });
    return resp.members;
  }

  async getUserById(userId: number): Promise<ZulipUser> {
    const resp = await this.request<{ result: string; user: ZulipUser }>('GET', `/users/${userId}`);
    return resp.user;
  }

  async getMyProfile(): Promise<ZulipUser> {
    const resp = await this.request<{ result: string } & ZulipUser>('GET', '/users/me');
    // The /users/me endpoint returns fields directly (not nested under 'user')
    return resp as unknown as ZulipUser;
  }

  async getUserPresence(userIdOrEmail: string | number): Promise<ZulipPresence> {
    const resp = await this.request<{ result: string; presence: ZulipPresence }>(
      'GET',
      `/users/${userIdOrEmail}/presence`
    );
    return resp.presence;
  }

  // ─── Reactions ────────────────────────────────────────────────────────────

  async addReaction(
    messageId: number,
    emojiName: string,
    emojiCode?: string,
    reactionType?: 'unicode_emoji' | 'realm_emoji' | 'zulip_extra_emoji'
  ): Promise<void> {
    const body: Record<string, unknown> = { emoji_name: emojiName };
    if (emojiCode) body.emoji_code = emojiCode;
    if (reactionType) body.reaction_type = reactionType;
    await this.request('POST', `/messages/${messageId}/reactions`, body);
  }

  async removeReaction(
    messageId: number,
    emojiName: string,
    emojiCode?: string,
    reactionType?: string
  ): Promise<void> {
    const body: Record<string, unknown> = { emoji_name: emojiName };
    if (emojiCode) body.emoji_code = emojiCode;
    if (reactionType) body.reaction_type = reactionType;
    await this.request('DELETE', `/messages/${messageId}/reactions`, body);
  }

  // ─── Direct Messages ──────────────────────────────────────────────────────

  async getDirectMessages(params: {
    with?: string;
    anchor?: string | number;
    numBefore?: number;
    numAfter?: number;
  } = {}): Promise<ZulipMessage[]> {
    const narrow: NarrowFilter[] = params.with
      ? [{ operator: 'dm', operand: params.with }]
      : [{ operator: 'is', operand: 'dm' }];

    return this.retrieveMessages({
      narrow,
      anchor: params.anchor ?? 'newest',
      numBefore: params.numBefore ?? 20,
      numAfter: params.numAfter ?? 0,
    });
  }

  // ─── Flags ────────────────────────────────────────────────────────────────

  async updateMessageFlags(
    messages: number[],
    flag: string,
    op: 'add' | 'remove'
  ): Promise<number[]> {
    const resp = await this.request<{ result: string; messages: number[] }>(
      'POST',
      '/messages/flags',
      { messages, flag, op }
    );
    return resp.messages;
  }
}
