/**
 * Durable Object - Global Room
 * Все пользователи автоматически видят друг друга
 */

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // Map<userId, { ws, username }>
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      const userId = request.headers.get('X-User-Code'); // Используем старый заголовок для совместимости
      
      if (!userId) {
        return new Response('Missing user ID', { status: 400 });
      }

      // Get WebSocket from request (passed from worker.js)
      // @ts-ignore - webSocket is passed via fetch options
      const server = request.webSocket;
      
      if (!server) {
        return new Response('WebSocket not found in request', { status: 400 });
      }

      // Accept the WebSocket immediately
      server.accept();

      // Create session
      const session = {
        ws: server,
        userId,
        username: `User${userId.substring(0, 4)}`
      };

      // Store session immediately (don't await storage)
      this.sessions.set(userId, session);
      
      // Store username asynchronously (don't block)
      this.state.storage.put(`username:${userId}`, session.username).catch(console.error);

      // Setup message handlers
      // @ts-ignore
      server.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleMessage(userId, data);
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });

      // @ts-ignore
      server.addEventListener('close', () => {
        this.sessions.delete(userId);
        // Уведомляем всех что пользователь отключился
        this.broadcast('USER_DISCONNECTED', { userId }, userId);
      });

      // Notify user is registered
      this.sendToUser(userId, 'USER_REGISTERED', { userId });

      // Отправляем список всех пользователей (все автоматически друзья)
      await this.sendUsersList(userId);

      // Уведомляем всех что новый пользователь подключился
      this.broadcast('USER_CONNECTED', { 
        user: {
          id: userId,
          username: session.username,
          status: 'online'
        }
      }, userId);

      // WebSocket уже принят, просто возвращаем успешный ответ
      return new Response(null, { status: 101 });
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle incoming message
   */
  async handleMessage(userId, data) {
    const { type, payload } = data;
    const session = this.sessions.get(userId);

    if (!session) return;

    switch (type) {
      case 'USER_REGISTER':
        // Update username if provided
        if (payload.username) {
          session.username = payload.username;
          await this.state.storage.put(`username:${userId}`, payload.username);
          
          // Уведомляем всех об изменении никнейма
          this.broadcast('USER_STATUS_UPDATE', {
            userId,
            username: payload.username,
            status: 'online'
          }, userId);
        }
        break;

      case 'NICKNAME_UPDATE':
        // Update username
        session.username = payload.nickname;
        await this.state.storage.put(`username:${userId}`, payload.nickname);
        
        // Уведомляем всех об изменении никнейма
        this.broadcast('USER_STATUS_UPDATE', {
          userId,
          username: payload.nickname,
          status: 'online'
        }, userId);
        break;

      case 'MESSAGE_CREATE':
        await this.handleMessage_Create(userId, payload);
        break;

      case 'CALL_OFFER':
        this.handleCallOffer(userId, payload);
        break;

      case 'CALL_ANSWER':
        this.handleCallAnswer(userId, payload);
        break;

      case 'ICE_CANDIDATE':
        this.handleIceCandidate(userId, payload);
        break;

      case 'CALL_END':
        this.handleCallEnd(userId, payload);
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }

  /**
   * Send list of all users to a user
   */
  async sendUsersList(userId) {
    const users = [];

    for (const [otherUserId, otherSession] of this.sessions) {
      if (otherUserId !== userId) {
        const username = await this.state.storage.get(`username:${otherUserId}`) || otherSession.username;
        
        users.push({
          id: otherUserId,
          username,
          status: 'online'
        });
      }
    }

    this.sendToUser(userId, 'USERS_LIST', { users });
  }

  /**
   * Handle message creation
   */
  async handleMessage_Create(userId, payload) {
    const session = this.sessions.get(userId);
    if (!session) return;

    const { channelId, content } = payload;

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channel_id: channelId,
      author_id: userId,
      content,
      timestamp: new Date().toISOString()
    };

    // Store message
    const channelMessages = await this.state.storage.get(`messages:${channelId}`) || [];
    channelMessages.push(message);
    
    // Keep last 100 messages
    if (channelMessages.length > 100) {
      channelMessages.shift();
    }
    
    await this.state.storage.put(`messages:${channelId}`, channelMessages);

    // Broadcast to recipient
    if (channelId.startsWith('dm-')) {
      const recipientId = channelId.replace('dm-', '');
      
      // Send to sender
      this.sendToUser(userId, 'MESSAGE_CREATE', message);
      
      // Send to recipient
      if (this.sessions.has(recipientId)) {
        const recipientMessage = {
          ...message,
          channel_id: `dm-${userId}` // Reverse the channel ID for recipient
        };
        this.sendToUser(recipientId, 'MESSAGE_CREATE', recipientMessage);
      }
    } else {
      // Broadcast to all users in channel (global)
      this.broadcast('MESSAGE_CREATE', message);
    }
  }

  /**
   * Handle WebRTC call offer
   */
  handleCallOffer(userId, payload) {
    const { targetUserId, offer, callType } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'INCOMING_CALL', {
        callerId: userId,
        offer,
        callType
      });
    }
  }

  /**
   * Handle WebRTC call answer
   */
  handleCallAnswer(userId, payload) {
    const { targetUserId, answer } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'CALL_ANSWERED', {
        callerId: userId,
        answer
      });
    }
  }

  /**
   * Handle ICE candidate
   */
  handleIceCandidate(userId, payload) {
    const { targetUserId, candidate } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'ICE_CANDIDATE', {
        fromUserId: userId,
        candidate
      });
    }
  }

  /**
   * Handle call end
   */
  handleCallEnd(userId, payload) {
    const { targetUserId } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'CALL_ENDED', {
        userId
      });
    }
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId, type, payload) {
    const session = this.sessions.get(userId);
    if (session && session.ws.readyState === 1) { // 1 = OPEN
      session.ws.send(JSON.stringify({ type, payload }));
    }
  }

  /**
   * Broadcast to all connected users (except sender)
   */
  broadcast(type, payload, excludeUserId = null) {
    const message = JSON.stringify({ type, payload });
    
    for (const [userId, session] of this.sessions) {
      if (userId !== excludeUserId && session.ws.readyState === 1) {
        session.ws.send(message);
      }
    }
  }
}
