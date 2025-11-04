/**
 * Cloudflare Worker - WebSocket Gateway
 * Handles WebSocket connections and routes to Durable Objects
 */

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

  // Get user code from query parameter
  const url = new URL(request.url);
  const userCode = url.searchParams.get('token');

  if (!userCode) {
    return new Response('Missing user code', { status: 400 });
  }

  // Create WebSocket pair
  const [client, server] = Object.values(new WebSocketPair());

  // Get the global Durable Object instance (single room for all users)
  const id = env.ROOM.idFromName('global-room');
  const roomObject = env.ROOM.get(id);

  // Forward the WebSocket to the Durable Object
  await roomObject.fetch('http://internal/websocket', {
    headers: {
      'Upgrade': 'websocket',
      'X-User-Code': userCode
    },
    // @ts-ignore
    webSocket: server
  });

  return new Response(null, {
    status: 101,
    // @ts-ignore
    webSocket: client
  });
}

// WebSocket Pair polyfill for TypeScript
class WebSocketPair {
  constructor() {
    return [new WebSocket(), new WebSocket()];
  }
}
