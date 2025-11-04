/**
 * Durable Object - Global Room
 * Manages all connected users, friends, and messages
 */

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // Map<userCode, { ws, username, friends: Set<userCode> }>
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      const userCode = request.headers.get('X-User-Code');
      
      if (!userCode) {
        return new Response('Missing user code', { status: 400 });
      }

      // Get WebSocket from request
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      // Accept the WebSocket
      // @ts-ignore
      server.accept();

      // Create session
      const session = {
        ws: server,
        userCode,
        username: `User${userCode.substring(0, 4)}`,
        friends: new Set()
      };

      // Load friends from storage
      const storedFriends = await this.state.storage.get(`friends:${userCode}`);
      if (storedFriends) {
        session.friends = new Set(storedFriends);
      }

      this.sessions.set(userCode, session);

      // Setup message handlers
      // @ts-ignore
      server.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleMessage(userCode, data);
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });

      // @ts-ignore
      server.addEventListener('close', () => {
        this.sessions.delete(userCode);
        this.broadcastToFriends(userCode, 'FRIEND_OFFLINE', { userId: userCode });
      });

      // Notify user is registered
      this.sendToUser(userCode, 'USER_REGISTERED', { userCode });

      // Send friends list
      await this.sendFriendsList(userCode);

      // Notify friends that user is online
      this.broadcastToFriends(userCode, 'FRIEND_ONLINE', { userId: userCode });

      return new Response(null, {
        status: 101,
        // @ts-ignore
        webSocket: client
      });
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle incoming message
   */
  async handleMessage(userCode, data) {
    const { type, payload } = data;
    const session = this.sessions.get(userCode);

    if (!session) return;

    switch (type) {
      case 'USER_REGISTER':
        // Update username if provided
        if (payload.username) {
          session.username = payload.username;
          await this.state.storage.put(`username:${userCode}`, payload.username);
        }
        break;

      case 'NICKNAME_UPDATE':
        // Update username
        session.username = payload.nickname;
        await this.state.storage.put(`username:${userCode}`, payload.nickname);
        
        // Notify friends
        this.broadcastToFriends(userCode, 'FRIEND_UPDATED', {
          userId: userCode,
          username: payload.nickname
        });
        break;

      case 'ADD_FRIEND':
        await this.handleAddFriend(userCode, payload.friendCode);
        break;

      case 'MESSAGE_CREATE':
        await this.handleMessage_Create(userCode, payload);
        break;

      case 'CALL_OFFER':
        this.handleCallOffer(userCode, payload);
        break;

      case 'CALL_ANSWER':
        this.handleCallAnswer(userCode, payload);
        break;

      case 'ICE_CANDIDATE':
        this.handleIceCandidate(userCode, payload);
        break;

      case 'CALL_END':
        this.handleCallEnd(userCode, payload);
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }

  /**
   * Add friend by code
   */
  async handleAddFriend(userCode, friendCode) {
    const session = this.sessions.get(userCode);
    if (!session) return;

    // Check if friend exists (has ever connected)
    const friendUsername = await this.state.storage.get(`username:${friendCode}`);
    
    if (!friendUsername) {
      // If friend hasn't registered yet, store it anyway
      // They will appear offline until they connect
      this.sendToUser(userCode, 'ERROR', {
        message: 'Пользователь с таким кодом не найден. Убедитесь, что он зарегистрировался.'
      });
      return;
    }

    // Add to friends
    session.friends.add(friendCode);
    await this.state.storage.put(`friends:${userCode}`, Array.from(session.friends));

    // Add mutual friendship
    const friendSession = this.sessions.get(friendCode);
    if (friendSession) {
      friendSession.friends.add(userCode);
      await this.state.storage.put(`friends:${friendCode}`, Array.from(friendSession.friends));
    } else {
      // Friend is offline, store their friendship
      const friendFriends = await this.state.storage.get(`friends:${friendCode}`) || [];
      if (!friendFriends.includes(userCode)) {
        friendFriends.push(userCode);
        await this.state.storage.put(`friends:${friendCode}`, friendFriends);
      }
    }

    // Notify both users
    this.sendToUser(userCode, 'FRIEND_ADDED', {
      friend: {
        id: friendCode,
        username: friendUsername,
        status: this.sessions.has(friendCode) ? 'online' : 'offline'
      }
    });

    if (friendSession) {
      this.sendToUser(friendCode, 'FRIEND_ADDED', {
        friend: {
          id: userCode,
          username: session.username,
          status: 'online'
        }
      });
    }

    // Refresh friends lists
    await this.sendFriendsList(userCode);
    if (friendSession) {
      await this.sendFriendsList(friendCode);
    }
  }

  /**
   * Send friends list to user
   */
  async sendFriendsList(userCode) {
    const session = this.sessions.get(userCode);
    if (!session) return;

    const friends = [];

    for (const friendCode of session.friends) {
      const friendUsername = await this.state.storage.get(`username:${friendCode}`) || `User${friendCode.substring(0, 4)}`;
      
      friends.push({
        id: friendCode,
        username: friendUsername,
        status: this.sessions.has(friendCode) ? 'online' : 'offline'
      });
    }

    this.sendToUser(userCode, 'FRIENDS_LIST', { friends });
  }

  /**
   * Handle message creation
   */
  async handleMessage_Create(userCode, payload) {
    const session = this.sessions.get(userCode);
    if (!session) return;

    const { channelId, content } = payload;

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channel_id: channelId,
      author_id: userCode,
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
      const recipientCode = channelId.replace('dm-', '');
      
      // Send to sender
      this.sendToUser(userCode, 'MESSAGE_CREATE', message);
      
      // Send to recipient
      if (this.sessions.has(recipientCode)) {
        const recipientMessage = {
          ...message,
          channel_id: `dm-${userCode}` // Reverse the channel ID for recipient
        };
        this.sendToUser(recipientCode, 'MESSAGE_CREATE', recipientMessage);
      }
    } else {
      // Broadcast to all users in channel (global)
      this.broadcast('MESSAGE_CREATE', message);
    }
  }

  /**
   * Handle WebRTC call offer
   */
  handleCallOffer(userCode, payload) {
    const { targetUserId, offer, callType } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'INCOMING_CALL', {
        callerId: userCode,
        offer,
        callType
      });
    }
  }

  /**
   * Handle WebRTC call answer
   */
  handleCallAnswer(userCode, payload) {
    const { targetUserId, answer } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'CALL_ANSWERED', {
        callerId: userCode,
        answer
      });
    }
  }

  /**
   * Handle ICE candidate
   */
  handleIceCandidate(userCode, payload) {
    const { targetUserId, candidate } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'ICE_CANDIDATE', {
        fromUserId: userCode,
        candidate
      });
    }
  }

  /**
   * Handle call end
   */
  handleCallEnd(userCode, payload) {
    const { targetUserId } = payload;
    
    if (this.sessions.has(targetUserId)) {
      this.sendToUser(targetUserId, 'CALL_ENDED', {
        userId: userCode
      });
    }
  }

  /**
   * Send message to specific user
   */
  sendToUser(userCode, type, payload) {
    const session = this.sessions.get(userCode);
    if (session && session.ws.readyState === 1) { // 1 = OPEN
      session.ws.send(JSON.stringify({ type, payload }));
    }
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(type, payload) {
    const message = JSON.stringify({ type, payload });
    
    for (const [userCode, session] of this.sessions) {
      if (session.ws.readyState === 1) {
        session.ws.send(message);
      }
    }
  }

  /**
   * Broadcast to user's friends
   */
  broadcastToFriends(userCode, type, payload) {
    const session = this.sessions.get(userCode);
    if (!session) return;

    const message = JSON.stringify({ type, payload });

    for (const friendCode of session.friends) {
      const friendSession = this.sessions.get(friendCode);
      if (friendSession && friendSession.ws.readyState === 1) {
        friendSession.ws.send(message);
      }
    }
  }
}

// WebSocket Pair polyfill for TypeScript
class WebSocketPair {
  constructor() {
    return [new WebSocket(), new WebSocket()];
  }
}
