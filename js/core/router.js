/**
 * Hash-based Router for NebulaChat
 * Handles navigation with #/g/:guildId/c/:channelId pattern
 */

export class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.params = {};
    
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  /**
   * Register a route pattern with handler
   * @param {string} pattern - Route pattern like '/g/:guildId/c/:channelId'
   * @param {Function} handler - Handler function that receives params
   */
  on(pattern, handler) {
    this.routes.set(pattern, handler);
  }

  /**
   * Navigate to a route
   * @param {string} path - Path to navigate to
   */
  navigate(path) {
    window.location.hash = path;
  }

  /**
   * Handle current route
   */
  handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    
    for (const [pattern, handler] of this.routes) {
      const params = this.matchRoute(pattern, hash);
      if (params) {
        this.currentRoute = pattern;
        this.params = params;
        handler(params);
        return;
      }
    }
    
    // No match found, trigger default route
    const defaultHandler = this.routes.get('/');
    if (defaultHandler) {
      this.currentRoute = '/';
      this.params = {};
      defaultHandler({});
    }
  }

  /**
   * Match a route pattern against a path
   * @param {string} pattern - Route pattern
   * @param {string} path - Actual path
   * @returns {Object|null} - Matched parameters or null
   */
  matchRoute(pattern, path) {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    
    if (patternParts.length !== pathParts.length) {
      return null;
    }
    
    const params = {};
    
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      
      if (patternPart.startsWith(':')) {
        // Parameter
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
      } else if (patternPart !== pathPart) {
        // Exact match failed
        return null;
      }
    }
    
    return params;
  }

  /**
   * Get current route parameters
   * @returns {Object} - Current parameters
   */
  getParams() {
    return { ...this.params };
  }

  /**
   * Get current route path
   * @returns {string} - Current route pattern
   */
  getCurrentRoute() {
    return this.currentRoute;
  }
}

