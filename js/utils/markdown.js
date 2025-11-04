/**
 * Markdown Parser
 * Lightweight markdown parser with security
 */

import { escapeHtml } from './security.js';

/**
 * Parse markdown text to HTML
 * @param {string} text - Markdown text
 * @returns {string} - HTML string
 */
export function parseMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks (must be before inline code)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'text';
    return `<pre><code class="language-${escapeHtml(language)}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links - auto-detect
  html = html.replace(
    /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Parse user mentions
 * @param {string} text - Text with mentions
 * @param {Array} users - Available users
 * @returns {string} - HTML with mention spans
 */
export function parseMentions(text, users = []) {
  const userMap = new Map(users.map(u => [u.username.toLowerCase(), u]));

  return text.replace(/@(\w+)/g, (match, username) => {
    const user = userMap.get(username.toLowerCase());
    if (user) {
      return `<span class="message__mention" data-user-id="${user.id}">@${escapeHtml(username)}</span>`;
    }
    return match;
  });
}

/**
 * Parse channel mentions
 * @param {string} text - Text with channel mentions
 * @param {Array} channels - Available channels
 * @returns {string} - HTML with channel links
 */
export function parseChannelMentions(text, channels = []) {
  const channelMap = new Map(channels.map(c => [c.name.toLowerCase(), c]));

  return text.replace(/#([\w-]+)/g, (match, channelName) => {
    const channel = channelMap.get(channelName.toLowerCase());
    if (channel) {
      return `<span class="message__mention" data-channel-id="${channel.id}">#${escapeHtml(channelName)}</span>`;
    }
    return match;
  });
}

/**
 * Parse emoji shortcuts
 * @param {string} text - Text with emoji codes
 * @returns {string} - Text with emoji
 */
export function parseEmoji(text) {
  const emojiMap = {
    ':smile:': '😊',
    ':heart:': '❤️',
    ':thumbsup:': '👍',
    ':thumbsdown:': '👎',
    ':fire:': '🔥',
    ':star:': '⭐',
    ':rocket:': '🚀',
    ':eyes:': '👀',
    ':thinking:': '🤔',
    ':tada:': '🎉',
    ':wave:': '👋',
    ':check:': '✅',
    ':cross:': '❌'
  };

  let result = text;
  Object.entries(emojiMap).forEach(([code, emoji]) => {
    result = result.replace(new RegExp(code, 'g'), emoji);
  });

  return result;
}

/**
 * Parse complete message with all features
 * @param {string} text - Raw message text
 * @param {Object} context - Context with users, channels
 * @returns {string} - Parsed HTML
 */
export function parseMessage(text, context = {}) {
  if (!text) return '';

  let parsed = text;

  // Parse markdown
  parsed = parseMarkdown(parsed);

  // Parse mentions (after markdown to avoid escaping)
  if (context.users) {
    parsed = parseMentions(parsed, context.users);
  }

  if (context.channels) {
    parsed = parseChannelMentions(parsed, context.channels);
  }

  // Parse emoji
  parsed = parseEmoji(parsed);

  return parsed;
}

/**
 * Strip markdown formatting (for plain text)
 * @param {string} text - Markdown text
 * @returns {string} - Plain text
 */
export function stripMarkdown(text) {
  if (!text) return '';

  return text
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^> (.+)$/gm, '$1')
    .trim();
}

/**
 * Lazy markdown parser using requestIdleCallback
 * @param {string} text - Markdown text
 * @param {Object} context - Parse context
 * @returns {Promise<string>} - Parsed HTML
 */
export function parseMarkdownLazy(text, context = {}) {
  return new Promise((resolve) => {
    const callback = () => {
      const parsed = parseMessage(text, context);
      resolve(parsed);
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: 1000 });
    } else {
      setTimeout(callback, 0);
    }
  });
}

