/**
 * Cloudflare Worker - WebSocket Gateway
 * Handles WebSocket connections directly and uses Durable Object for state
 */

import { Room } from './objects/Room.js';

// Экспортируем класс Room для Durable Objects
export { Room };

// Store active WebSocket connections in Worker memory
const connections = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // WebSocket endpoint
    if (url.pathname === '/ws') {
      return handleWebSocket(request, env, ctx);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Default response
    return new Response('NebulaChat API', { status: 200 });
  }
};

/**
 * Handle WebSocket upgrade
 */
async function handleWebSocket(request, env, ctx) {
  const upgradeHeader = request.headers.get('Upgrade');
  
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  // Get user ID from query parameter
  const url = new URL(request.url);
  const userId = url.searchParams.get('token');

  if (!userId) {
    return new Response('Missing user ID', { status: 400 });
  }

  // Create WebSocket pair
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  // Accept both WebSockets
  client.accept();
  server.accept();

  // Get Durable Object for state management
  const id = env.ROOM.idFromName('global-room');
  const roomObject = env.ROOM.get(id);

  // Store connection info
  const connectionInfo = {
    userId,
    client,
    server,
    roomObject
  };
  connections.set(userId, connectionInfo);

  // Register user in Durable Object
  ctx.waitUntil(
    roomObject.fetch('http://internal/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username: `User${userId.substring(0, 4)}` })
    }).catch(err => console.error('Register error:', err))
  );

  // Handle client messages
  client.addEventListener('message', async (event) => {
    try {
      const data = JSON.parse(event.data);
      await handleMessage(userId, data, roomObject, connections);
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  // Handle client close
  client.addEventListener('close', () => {
    connections.delete(userId);
    roomObject.fetch('http://internal/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    }).catch(err => console.error('Disconnect error:', err));
  });

  // Get initial users list
  ctx.waitUntil(
    roomObject.fetch('http://internal/users', {
      method: 'GET',
      headers: { 'X-User-Code': userId }
    }).then(async (response) => {
      const data = await response.json();
      if (data.users) {
        client.send(JSON.stringify({
          type: 'USERS_LIST',
          payload: { users: data.users }
        }));
      }
    }).catch(err => console.error('Get users error:', err))
  );

  // Notify other users about new connection
  ctx.waitUntil(
    roomObject.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'USER_CONNECTED',
        payload: {
          user: {
            id: userId,
            username: `User${userId.substring(0, 4)}`,
            status: 'online'
          }
        },
        excludeUserId: userId
      })
    }).catch(err => console.error('Broadcast error:', err))
  );

  return new Response(null, {
    status: 101,
    // @ts-ignore
    webSocket: client
  });
}

/**
 * Handle incoming message
 */
async function handleMessage(userId, data, roomObject, connections) {
  const { type, payload } = data;

  switch (type) {
    case 'USER_REGISTER':
      if (payload.username) {
        await roomObject.fetch('http://internal/update-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, username: payload.username })
        });
      }
      break;

    case 'MESSAGE_CREATE':
      const { channelId, content } = payload;
      const message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        channel_id: channelId,
        author_id: userId,
        content,
        timestamp: new Date().toISOString()
      };

      // Broadcast to recipient
      if (channelId.startsWith('dm-')) {
        const recipientId = channelId.replace('dm-', '');
        const recipient = connections.get(recipientId);
        
        if (recipient) {
          recipient.client.send(JSON.stringify({
            type: 'MESSAGE_CREATE',
            payload: {
              ...message,
              channel_id: `dm-${userId}` // Reverse for recipient
            }
          }));
        }
      }

      // Also send to sender
      const sender = connections.get(userId);
      if (sender) {
        sender.client.send(JSON.stringify({
          type: 'MESSAGE_CREATE',
          payload: message
        }));
      }
      break;

    case 'CALL_OFFER':
    case 'CALL_ANSWER':
    case 'ICE_CANDIDATE':
    case 'CALL_END':
      // Forward WebRTC messages
      const targetId = payload.targetUserId;
      const target = connections.get(targetId);
      if (target) {
        target.client.send(JSON.stringify({ type, payload }));
      }
      break;
  }
}
