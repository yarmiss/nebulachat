/**
 * Simple State Store with Persistence
 * Manages app state with subscriptions and localStorage persistence
 */

export class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.subscribers = new Map();
    this.persistKeys = new Set();
  }

  /**
   * Get current state or specific key
   * @param {string} key - Optional key to get specific state value
   * @returns {*} - State value
   */
  getState(key) {
    if (key) {
      return this.getNestedValue(this.state, key);
    }
    return { ...this.state };
  }

  /**
   * Set state value
   * @param {string|Object} keyOrState - Key path or state object
   * @param {*} value - Value to set (if key is string)
   */
  setState(keyOrState, value) {
    if (typeof keyOrState === 'string') {
      this.setNestedValue(this.state, keyOrState, value);
    } else {
      this.state = { ...this.state, ...keyOrState };
    }

    // Persist if needed
    this.persistState();

    // Notify subscribers
    this.notifySubscribers(keyOrState);
  }

  /**
   * Subscribe to state changes
   * @param {string} key - Key to watch (or '*' for all changes)
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    
    this.subscribers.get(key).add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(key);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Notify subscribers of state changes
   * @param {string} changedKey - Key that changed
   */
  notifySubscribers(changedKey) {
    // Notify specific key subscribers
    if (typeof changedKey === 'string' && this.subscribers.has(changedKey)) {
      const value = this.getNestedValue(this.state, changedKey);
      this.subscribers.get(changedKey).forEach(callback => {
        callback(value, this.state);
      });
    }

    // Notify global subscribers
    if (this.subscribers.has('*')) {
      this.subscribers.get('*').forEach(callback => {
        callback(this.state);
      });
    }
  }

  /**
   * Mark keys for persistence in localStorage
   * @param {string[]} keys - Keys to persist
   */
  setPersistKeys(keys) {
    keys.forEach(key => this.persistKeys.add(key));
  }

  /**
   * Persist state to localStorage
   */
  persistState() {
    if (this.persistKeys.size === 0) return;

    const persistData = {};
    this.persistKeys.forEach(key => {
      const value = this.getNestedValue(this.state, key);
      if (value !== undefined) {
        persistData[key] = value;
      }
    });

    try {
      localStorage.setItem('nebulaChat_state', JSON.stringify(persistData));
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  /**
   * Load persisted state from localStorage
   */
  loadPersistedState() {
    try {
      const data = localStorage.getItem('nebulaChat_state');
      if (data) {
        const parsed = JSON.parse(data);
        Object.keys(parsed).forEach(key => {
          this.setNestedValue(this.state, key, parsed[key]);
        });
      }
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-notation path
   * @returns {*} - Value at path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using dot notation
   * @param {Object} obj - Object to modify
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Clear all state
   */
  clear() {
    this.state = {};
    this.persistState();
    this.notifySubscribers('*');
  }

  /**
   * Clear persisted state from localStorage
   */
  clearPersisted() {
    try {
      localStorage.removeItem('nebulaChat_state');
    } catch (error) {
      console.error('Failed to clear persisted state:', error);
    }
  }
}

