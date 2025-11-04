/**
 * Cloudflare Worker - WebSocket Gateway
 * Handles WebSocket connections and routes to Durable Objects
 */

import { Room } from './objects/Room.js';

// Экспортируем класс Room для Durable Objects
export { Room };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // WebSocket endpoint
    if (url.pathname === '/ws') {
      return handleWebSocket(request, env);
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
async function handleWebSocket(request, env) {
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

  // Accept the client WebSocket immediately
  client.accept();

  // Get the global Durable Object instance (single room for all users)
  const id = env.ROOM.idFromName('global-room');
  const roomObject = env.ROOM.get(id);

  // Forward the server WebSocket to the Durable Object
  // @ts-ignore - webSocket is a special property
  await roomObject.fetch('http://internal/websocket', {
    method: 'GET',
    headers: {
      'Upgrade': 'websocket',
      'X-User-Code': userId
    },
    webSocket: server
  });

  return new Response(null, {
    status: 101,
    // @ts-ignore
    webSocket: client
  });
}
