/**
 * Security Utilities
 * XSS prevention and content filtering
 */

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';

  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };

  return text.replace(/[&<>"'/]/g, char => map[char]);
}

/**
 * Sanitize HTML by removing dangerous tags and attributes
 * @param {string} html - HTML string
 * @returns {string} - Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (!html) return '';

  // Allowed tags
  const allowedTags = [
    'a', 'b', 'i', 'strong', 'em', 'code', 'pre',
    'blockquote', 'span', 'br', 'p'
  ];

  // Allowed attributes per tag
  const allowedAttrs = {
    'a': ['href', 'target', 'rel'],
    'span': ['class', 'data-user-id', 'data-channel-id'],
    'code': ['class']
  };

  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Recursive sanitization
  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      // Remove disallowed tags
      if (!allowedTags.includes(tagName)) {
        return document.createTextNode(node.textContent);
      }

      // Remove disallowed attributes
      const allowedAttrList = allowedAttrs[tagName] || [];
      Array.from(node.attributes).forEach(attr => {
        if (!allowedAttrList.includes(attr.name)) {
          node.removeAttribute(attr.name);
        }
      });

      // Special handling for links
      if (tagName === 'a') {
        const href = node.getAttribute('href');
        if (href && !href.match(/^https?:\/\//i)) {
          node.removeAttribute('href');
        }
        // Ensure rel has noopener noreferrer
        node.setAttribute('rel', 'noopener noreferrer');
        node.setAttribute('target', '_blank');
      }

      // Recursively sanitize children
      Array.from(node.childNodes).forEach(child => {
        const sanitized = sanitizeNode(child);
        if (sanitized !== child) {
          node.replaceChild(sanitized, child);
        }
      });
    }

    return node;
  };

  Array.from(temp.childNodes).forEach(child => {
    sanitizeNode(child);
  });

  return temp.innerHTML;
}

/**
 * Validate URL is safe
 * @param {string} url - URL to validate
 * @returns {boolean} - True if safe
 */
export function isSafeUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();

    // Only allow http and https
    if (!['http:', 'https:'].includes(protocol)) {
      return false;
    }

    // Block localhost and private IPs in production
    if (window.location.hostname !== 'localhost') {
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Filter profanity and inappropriate content
 * @param {string} text - Text to filter
 * @returns {string} - Filtered text
 */
export function filterProfanity(text) {
  // Simple placeholder - in production use a proper library
  const profanityList = ['badword1', 'badword2']; // Add actual words as needed
  
  let filtered = text;
  profanityList.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  });

  return filtered;
}

/**
 * Validate file upload
 * @param {File} file - File object
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
export function validateFile(file, options = {}) {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  } = options;

  const errors = [];

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
  }

  // Check MIME type
  if (!allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} not allowed`);
  }

  // Check extension
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    errors.push(`File extension ${ext} not allowed`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate secure random token
 * @param {number} length - Token length
 * @returns {string} - Random token
 */
export function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash string using SHA-256
 * @param {string} text - Text to hash
 * @returns {Promise<string>} - Hex hash
 */
export async function hashString(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rate limiter for actions
 */
export class RateLimiter {
  constructor(maxActions, windowMs) {
    this.maxActions = maxActions;
    this.windowMs = windowMs;
    this.actions = [];
  }

  /**
   * Check if action is allowed
   * @returns {boolean} - True if allowed
   */
  tryAction() {
    const now = Date.now();
    
    // Remove old actions outside window
    this.actions = this.actions.filter(time => now - time < this.windowMs);

    if (this.actions.length >= this.maxActions) {
      return false;
    }

    this.actions.push(now);
    return true;
  }

  /**
   * Get time until next action allowed
   * @returns {number} - Milliseconds until allowed
   */
  getTimeUntilAllowed() {
    if (this.actions.length < this.maxActions) {
      return 0;
    }

    const oldestAction = Math.min(...this.actions);
    const timeSince = Date.now() - oldestAction;
    return Math.max(0, this.windowMs - timeSince);
  }

  /**
   * Reset limiter
   */
  reset() {
    this.actions = [];
  }
}

