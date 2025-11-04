/**
 * Helper Utilities
 * Common utility functions
 */

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} - Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Format timestamp to readable string
 * @param {string|Date} timestamp - Timestamp
 * @param {string} format - Format type ('time', 'date', 'datetime', 'relative')
 * @returns {string} - Formatted string
 */
export function formatTimestamp(timestamp, format = 'time') {
  const date = new Date(timestamp);
  const now = new Date();

  if (format === 'relative') {
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} д назад`;
  }

  const options = {
    time: { hour: '2-digit', minute: '2-digit' },
    date: { day: '2-digit', month: '2-digit', year: 'numeric' },
    datetime: { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    }
  };

  return date.toLocaleString('ru-RU', options[format] || options.time);
}

/**
 * Generate avatar color from string
 * @param {string} str - String to generate color from
 * @returns {string} - Hex color
 */
export function stringToColor(str) {
  if (!str) return '#5865F2';

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colors = [
    '#5865F2', '#EB459E', '#ED4245', '#FEE75C',
    '#57F287', '#1ABC9C', '#3498DB', '#9B59B6'
  ];

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get initials from name
 * @param {string} name - Name
 * @returns {string} - Initials
 */
export function getInitials(name) {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Create avatar element
 * @param {Object} user - User object
 * @returns {HTMLElement} - Avatar element
 */
export function createAvatar(user) {
  const avatar = document.createElement('div');
  avatar.className = 'user-avatar';
  avatar.style.background = stringToColor(user.username);

  if (user.avatar) {
    const img = document.createElement('img');
    img.src = user.avatar;
    img.alt = user.username;
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitials(user.username);
  }

  return avatar;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Success status
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (err) {
      document.body.removeChild(textarea);
      return false;
    }
  }
}

/**
 * Download file from blob
 * @param {Blob} blob - File blob
 * @param {string} filename - Filename
 */
export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format file size
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Generate unique ID
 * @param {string} prefix - Optional prefix
 * @returns {string} - Unique ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone object
 * @param {*} obj - Object to clone
 * @returns {*} - Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (obj instanceof Set) return new Set([...obj].map(item => deepClone(item)));
  if (obj instanceof Map) {
    return new Map([...obj].map(([k, v]) => [deepClone(k), deepClone(v)]));
  }
  
  const cloned = {};
  Object.keys(obj).forEach(key => {
    cloned[key] = deepClone(obj[key]);
  });
  
  return cloned;
}

/**
 * Check if element is in viewport
 * @param {HTMLElement} element - Element to check
 * @param {number} offset - Offset in pixels
 * @returns {boolean} - True if in viewport
 */
export function isInViewport(element, offset = 0) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= -offset &&
    rect.left >= -offset &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + offset &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + offset
  );
}

/**
 * Smooth scroll to element
 * @param {HTMLElement|string} target - Element or selector
 * @param {Object} options - Scroll options
 */
export function scrollToElement(target, options = {}) {
  const element = typeof target === 'string' 
    ? document.querySelector(target) 
    : target;

  if (!element) return;

  const {
    behavior = 'smooth',
    block = 'start',
    inline = 'nearest',
    offset = 0
  } = options;

  if (offset !== 0) {
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior
    });
  } else {
    element.scrollIntoView({ behavior, block, inline });
  }
}

/**
 * Local storage with JSON support
 */
export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  clear() {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Create element with attributes
 * @param {string} tag - Tag name
 * @param {Object} attrs - Attributes
 * @param {Array|string} children - Children elements or text
 * @returns {HTMLElement} - Created element
 */
export function createElement(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      element.addEventListener(event, value);
    } else {
      element.setAttribute(key, value);
    }
  });

  const childArray = Array.isArray(children) ? children : [children];
  childArray.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof HTMLElement) {
      element.appendChild(child);
    }
  });

  return element;
}

