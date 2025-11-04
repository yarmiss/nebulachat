// ===== Cloudflare Workers - Главный файл =====
export interface Env {
  DB: D1Database;
  BUCKET?: R2Bucket; // Опционально, пока R2 не включен
  CACHE: KVNamespace;
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
  USER_STATUS: DurableObjectNamespace<UserStatus>;
}

// ===== Durable Object: Chat Room =====
export class ChatRoom implements DurableObject {
  state: DurableObjectState;
  sessions: Set<WebSocket> = new Set();
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // REST API
    const url = new URL(request.url);
    
    if (url.pathname === '/messages') {
      if (request.method === 'GET') {
        return this.getMessages(request);
      } else if (request.method === 'POST') {
        return this.postMessage(request);
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  async handleSession(ws: WebSocket) {
    this.sessions.add(ws);

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        
        // Broadcast сообщения всем подключенным клиентам
        for (const session of this.sessions) {
          if (session !== ws && session.readyState === WebSocket.READY_STATE_OPEN) {
            session.send(JSON.stringify(data));
          }
        }

        // Сохранение в D1
        if (data.type === 'message') {
          await this.env.DB.prepare(
            'INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (?, ?, ?, ?)'
          ).bind(data.channelId, data.userId, data.content, new Date().toISOString()).run();
        }
      } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
      }
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(ws);
    });
  }

  async getMessages(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const result = await this.env.DB.prepare(
      `SELECT m.*, u.username, u.avatar_url 
       FROM messages m 
       INNER JOIN users u ON m.user_id = u.id 
       WHERE m.channel_id = ? 
       ORDER BY m.created_at DESC 
       LIMIT ?`
    ).bind(channelId, limit).all();

    return Response.json(result.results);
  }

  async postMessage(request: Request): Promise<Response> {
    const data = await request.json();

    const result = await this.env.DB.prepare(
      'INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (?, ?, ?, ?)'
    ).bind(data.channelId, data.userId, data.content, new Date().toISOString()).run();

    // Broadcast новым подключениям
    const message = JSON.stringify({
      type: 'new-message',
      data: {
        id: result.meta.last_row_id,
        ...data
      }
    });

    for (const session of this.sessions) {
      if (session.readyState === WebSocket.READY_STATE_OPEN) {
        session.send(message);
      }
    }

    return Response.json({ success: true, id: result.meta.last_row_id });
  }
}

// ===== Durable Object: User Status =====
export class UserStatus implements DurableObject {
  state: DurableObjectState;
  env: Env;
  statuses: Map<number, string> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = parseInt(url.pathname.split('/').pop() || '0');

    if (request.method === 'GET') {
      const status = this.statuses.get(userId) || 'offline';
      return Response.json({ userId, status });
    } else if (request.method === 'PUT') {
      const data = await request.json();
      this.statuses.set(userId, data.status);
      
      // Сохранение в D1
      await this.env.DB.prepare(
        'UPDATE users SET status = ? WHERE id = ?'
      ).bind(data.status, userId).run();

      return Response.json({ success: true });
    }

    return new Response('Not Found', { status: 404 });
  }
}

// ===== Главный обработчик =====
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // WebSocket для чата (через Durable Objects)
    if (url.pathname.startsWith('/socket.io/')) {
      // Для Socket.IO используем Durable Objects
      const channelId = url.searchParams.get('channelId') || 'default';
      const id = env.CHAT_ROOM.idFromName(channelId);
      const obj = env.CHAT_ROOM.get(id);
      return obj.fetch(request);
    }

    // WebSocket для чата
    if (url.pathname.startsWith('/ws/chat/')) {
      const channelId = url.pathname.split('/').pop();
      const id = env.CHAT_ROOM.idFromName(channelId || 'default');
      const obj = env.CHAT_ROOM.get(id);
      return obj.fetch(request);
    }

    // User Status
    if (url.pathname.startsWith('/api/users/') && url.pathname.includes('/status')) {
      const userId = parseInt(url.pathname.split('/').pop() || '0');
      const id = env.USER_STATUS.idFromName(`user-${userId}`);
      const obj = env.USER_STATUS.get(id);
      return obj.fetch(request);
    }

    // REST API для сообщений
    if (url.pathname.startsWith('/api/messages')) {
      const channelId = url.searchParams.get('channelId');
      if (channelId) {
        const id = env.CHAT_ROOM.idFromName(channelId);
        const obj = env.CHAT_ROOM.get(id);
        return obj.fetch(request);
      }
    }

    // R2 файлы
    if (url.pathname.startsWith('/uploads/')) {
      const key = url.pathname.replace('/uploads/', '');
      const object = await env.BUCKET.get(key);
      
      if (object === null) {
        return new Response('File Not Found', { status: 404, headers: corsHeaders });
      }

      const headers = new Headers(corsHeaders);
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);

      return new Response(object.body, {
        headers,
      });
    }

    // Статические файлы (для Pages)
    if (!url.pathname.startsWith('/api/')) {
      // Cloudflare Pages будет обрабатывать статические файлы
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    // Кеш для API
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      const headers = new Headers(cachedResponse.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers,
      });
    }

    // Для production - все API запросы должны идти через ваш основной сервер
    // Здесь только WebSocket и файлы через R2
    return new Response('API endpoint not available in Workers. Use your main server.', { 
      status: 404, 
      headers: corsHeaders 
    });
  },
};

