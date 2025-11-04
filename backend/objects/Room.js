/**
 * Durable Object - Global Room
 * Manages user state and messages (accessed via HTTP from Worker)
 */

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.users = new Map(); // Map<userId, { username, status }>
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/register') {
      return this.handleRegister(request);
    }

    if (url.pathname === '/disconnect') {
      return this.handleDisconnect(request);
    }

    if (url.pathname === '/users') {
      return this.handleGetUsers(request);
    }

    if (url.pathname === '/update-username') {
      return this.handleUpdateUsername(request);
    }

    if (url.pathname === '/broadcast') {
      return this.handleBroadcast(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Register new user
   */
  async handleRegister(request) {
    const { userId, username } = await request.json();
    
    this.users.set(userId, {
      username: username || `User${userId.substring(0, 4)}`,
      status: 'online'
    });

    await this.state.storage.put(`username:${userId}`, this.users.get(userId).username);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Handle user disconnect
   */
  async handleDisconnect(request) {
    const { userId } = await request.json();
    
    const user = this.users.get(userId);
    if (user) {
      user.status = 'offline';
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Get list of all users
   */
  async handleGetUsers(request) {
    const excludeUserId = request.headers.get('X-User-Code');
    
    const usersList = [];
    for (const [id, user] of this.users) {
      if (id !== excludeUserId) {
        usersList.push({
          id,
          username: user.username,
          status: user.status
        });
      }
    }

    return new Response(JSON.stringify({ users: usersList }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Update username
   */
  async handleUpdateUsername(request) {
    const { userId, username } = await request.json();
    
    const user = this.users.get(userId);
    if (user) {
      user.username = username;
    } else {
      this.users.set(userId, { username, status: 'online' });
    }

    await this.state.storage.put(`username:${userId}`, username);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Broadcast message (for future use)
   */
  async handleBroadcast(request) {
    const { type, payload, excludeUserId } = await request.json();
    
    // This is handled by Worker, DO just stores the message if needed
    // Messages are stored for persistence
    if (type === 'MESSAGE_CREATE') {
      const channelMessages = await this.state.storage.get(`messages:${payload.channel_id}`) || [];
      channelMessages.push(payload);
      
      if (channelMessages.length > 100) {
        channelMessages.shift();
      }
      
      await this.state.storage.put(`messages:${payload.channel_id}`, channelMessages);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
