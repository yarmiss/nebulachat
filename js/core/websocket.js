/**
 * WebSocket Client with Auto-Reconnect
 * Connects to Cloudflare Worker WebSocket endpoint
 */

export class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      reconnectDecay: 1.5,
      maxReconnectAttempts: null,
      ...options
    };

    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.messageHandlers = new Map();
    this.isIntentionalClose = false;
    this.connected = false;
  }

  /**
   * Connect to WebSocket server
   * @param {string} token - Auth token
   */
  connect(token) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket already connected');
      return;
    }

    this.isIntentionalClose = false;
    const wsUrl = token ? `${this.url}?token=${encodeURIComponent(token)}` : this.url;

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('open');
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed', event.code, event.reason);
      this.connected = false;
      this.emit('close', event);

      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  /**
   * Handle incoming message
   * @param {Object} data - Message data
   */
  handleMessage(data) {
    const { type, payload } = data;

    // Emit to specific type handlers
    if (this.messageHandlers.has(type)) {
      this.messageHandlers.get(type).forEach(handler => {
        try {
          handler(payload, data);
        } catch (error) {
          console.error(`Error in message handler for ${type}:`, error);
        }
      });
    }

    // Emit to wildcard handlers
    if (this.messageHandlers.has('*')) {
      this.messageHandlers.get('*').forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('Error in wildcard message handler:', error);
        }
      });
    }
  }

  /**
   * Send message to server
   * @param {string} type - Message type
   * @param {Object} payload - Message payload
   */
  send(type, payload = {}) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send message');
      return false;
    }

    try {
      const message = JSON.stringify({ type, payload });
      this.ws.send(message);
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      return false;
    }
  }

  /**
   * Subscribe to message type
   * @param {string} type - Message type (or '*' for all)
   * @param {Function} handler - Handler function
   * @returns {Function} - Unsubscribe function
   */
  on(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }

    this.messageHandlers.get(type).add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  /**
   * Emit event to handlers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    const handlers = this.messageHandlers.get(`__${event}`);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Subscribe to connection events
   * @param {string} event - Event name ('open', 'close', 'error')
   * @param {Function} handler - Handler function
   * @returns {Function} - Unsubscribe function
   */
  addEventListener(event, handler) {
    return this.on(`__${event}`, handler);
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.options.maxReconnectAttempts !== null &&
        this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const timeout = Math.min(
      this.options.reconnectInterval * Math.pow(this.options.reconnectDecay, this.reconnectAttempts),
      this.options.maxReconnectInterval
    );

    console.log(`Reconnecting in ${timeout}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      const token = localStorage.getItem('nebulaChat_token');
      this.connect(token);
    }, timeout);
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.isIntentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Fake WebSocket for local development
 * Simulates incoming events with mock data
 */
export class FakeWebSocket {
  constructor() {
    this.handlers = new Map();
    this.connected = false;
    this.simulationInterval = null;
  }

  connect() {
    console.log('FakeWebSocket: Simulating connection...');
    this.connected = true;

    setTimeout(() => {
      this.emit('open');
      this.startSimulation();
    }, 100);
  }

  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type).add(handler);

    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  addEventListener(event, handler) {
    return this.on(`__${event}`, handler);
  }

  send(type, payload) {
    console.log('FakeWebSocket: Send', type, payload);
    // Echo back for testing
    setTimeout(() => {
      this.handleMessage({ type: `${type}_response`, payload });
    }, 100);
    return true;
  }

  handleMessage(data) {
    const { type } = data;

    if (this.handlers.has(type)) {
      this.handlers.get(type).forEach(handler => handler(data.payload, data));
    }

    if (this.handlers.has('*')) {
      this.handlers.get('*').forEach(handler => handler(data));
    }
  }

  emit(event, data) {
    const handlers = this.handlers.get(`__${event}`);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  startSimulation() {
    // Simulate random presence updates
    this.simulationInterval = setInterval(() => {
      if (!this.connected) return;

      const events = [
        {
          type: 'PRESENCE_UPDATE',
          payload: {
            user_id: `user-${Math.floor(Math.random() * 6) + 1}`,
            status: ['online', 'idle', 'dnd'][Math.floor(Math.random() * 3)]
          }
        },
        {
          type: 'TYPING_START',
          payload: {
            channel_id: 'channel-1',
            user_id: `user-${Math.floor(Math.random() * 6) + 1}`
          }
        }
      ];

      if (Math.random() > 0.7) {
        const event = events[Math.floor(Math.random() * events.length)];
        this.handleMessage(event);
      }
    }, 5000);
  }

  disconnect() {
    this.connected = false;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }
    this.emit('close');
  }

  isConnected() {
    return this.connected;
  }
}

