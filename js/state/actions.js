/**
 * State Actions
 * Business logic and state mutations
 */

import { generateId } from '../utils/helpers.js';

/**
 * Initialize app with mock data
 * @param {Store} store - App store
 * @param {Object} mockData - Mock data
 */
export function initializeApp(store, mockData) {
  store.setState({
    user: mockData.user,
    guilds: mockData.guilds,
    channels: mockData.channels,
    members: mockData.members,
    roles: mockData.roles,
    messages: mockData.messages,
    presences: mockData.presences,
    currentGuild: null,
    currentChannel: null,
    typing: {},
    settings: {
      theme: 'auto',
      language: 'ru',
      notifications: true,
      sounds: true
    }
  });

  // Set first guild and channel as default
  if (mockData.guilds.length > 0) {
    const firstGuild = mockData.guilds[0];
    const firstChannel = mockData.channels.find(c => c.guild_id === firstGuild.id);
    
    if (firstChannel) {
      store.setState('currentGuild', firstGuild.id);
      store.setState('currentChannel', firstChannel.id);
    }
  }
}

/**
 * Navigate to guild and channel
 * @param {Store} store - App store
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 */
export function navigateToChannel(store, guildId, channelId) {
  const channels = store.getState('channels');
  const channel = channels.find(c => c.id === channelId);

  if (!channel) {
    console.warn('Channel not found:', channelId);
    return;
  }

  store.setState('currentGuild', guildId);
  store.setState('currentChannel', channelId);

  // Mark channel as read
  const updatedChannels = channels.map(c => {
    if (c.id === channelId) {
      return { ...c, unread: false, unread_count: 0 };
    }
    return c;
  });

  store.setState('channels', updatedChannels);
}

/**
 * Send message
 * @param {Store} store - App store
 * @param {string} channelId - Channel ID
 * @param {string} content - Message content
 */
export function sendMessage(store, channelId, content) {
  const user = store.getState('user');
  const messages = store.getState('messages');

  const message = {
    id: generateId('msg'),
    channel_id: channelId,
    author_id: user.id,
    content: content.trim(),
    timestamp: new Date().toISOString(),
    edited: false,
    reactions: []
  };

  store.setState('messages', [...messages, message]);

  return message;
}

/**
 * Edit message
 * @param {Store} store - App store
 * @param {string} messageId - Message ID
 * @param {string} newContent - New content
 */
export function editMessage(store, messageId, newContent) {
  const messages = store.getState('messages');

  const updatedMessages = messages.map(msg => {
    if (msg.id === messageId) {
      return { ...msg, content: newContent.trim(), edited: true };
    }
    return msg;
  });

  store.setState('messages', updatedMessages);
}

/**
 * Delete message
 * @param {Store} store - App store
 * @param {string} messageId - Message ID
 */
export function deleteMessage(store, messageId) {
  const messages = store.getState('messages');
  const updatedMessages = messages.filter(msg => msg.id !== messageId);
  store.setState('messages', updatedMessages);
}

/**
 * Toggle reaction on message
 * @param {Store} store - App store
 * @param {string} messageId - Message ID
 * @param {string} emoji - Emoji
 */
export function toggleReaction(store, messageId, emoji) {
  const messages = store.getState('messages');
  const user = store.getState('user');

  const updatedMessages = messages.map(msg => {
    if (msg.id !== messageId) return msg;

    const reactions = [...msg.reactions];
    const existingReaction = reactions.find(r => r.emoji === emoji);

    if (existingReaction) {
      // Toggle user's reaction
      const hasReacted = existingReaction.users.includes(user.id);

      if (hasReacted) {
        existingReaction.users = existingReaction.users.filter(id => id !== user.id);
        existingReaction.count = existingReaction.users.length;

        // Remove reaction if no users left
        if (existingReaction.count === 0) {
          return {
            ...msg,
            reactions: reactions.filter(r => r.emoji !== emoji)
          };
        }
      } else {
        existingReaction.users.push(user.id);
        existingReaction.count = existingReaction.users.length;
      }
    } else {
      // Add new reaction
      reactions.push({
        emoji,
        count: 1,
        users: [user.id]
      });
    }

    return { ...msg, reactions };
  });

  store.setState('messages', updatedMessages);
}

/**
 * Create guild
 * @param {Store} store - App store
 * @param {Object} guildData - Guild data
 */
export function createGuild(store, guildData) {
  const guilds = store.getState('guilds');
  const user = store.getState('user');

  const guild = {
    id: generateId('guild'),
    name: guildData.name,
    icon: null,
    owner_id: user.id,
    ...guildData
  };

  store.setState('guilds', [...guilds, guild]);

  // Create default channel
  createChannel(store, {
    guild_id: guild.id,
    name: 'общий',
    type: 'text',
    category: 'Текстовые каналы'
  });

  return guild;
}

/**
 * Create channel
 * @param {Store} store - App store
 * @param {Object} channelData - Channel data
 */
export function createChannel(store, channelData) {
  const channels = store.getState('channels');

  const channel = {
    id: generateId('channel'),
    position: channels.filter(c => c.guild_id === channelData.guild_id).length,
    unread: false,
    ...channelData
  };

  store.setState('channels', [...channels, channel]);

  return channel;
}

/**
 * Update presence
 * @param {Store} store - App store
 * @param {string} userId - User ID
 * @param {Object} presence - Presence data
 */
export function updatePresence(store, userId, presence) {
  const presences = store.getState('presences');

  store.setState('presences', {
    ...presences,
    [userId]: {
      ...presences[userId],
      ...presence
    }
  });

  // Update member status
  const members = store.getState('members');
  const updatedMembers = members.map(member => {
    if (member.id === userId) {
      return { ...member, status: presence.status };
    }
    return member;
  });

  store.setState('members', updatedMembers);
}

/**
 * Set typing indicator
 * @param {Store} store - App store
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID
 */
export function setTyping(store, channelId, userId) {
  const typing = store.getState('typing');

  if (!typing[channelId]) {
    typing[channelId] = new Set();
  }

  typing[channelId].add(userId);
  store.setState('typing', { ...typing });

  // Clear after 5 seconds
  setTimeout(() => {
    const currentTyping = store.getState('typing');
    if (currentTyping[channelId]) {
      currentTyping[channelId].delete(userId);
      store.setState('typing', { ...currentTyping });
    }
  }, 5000);
}

/**
 * Update settings
 * @param {Store} store - App store
 * @param {Object} updates - Settings updates
 */
export function updateSettings(store, updates) {
  const settings = store.getState('settings');
  store.setState('settings', { ...settings, ...updates });

  // Apply theme
  if (updates.theme !== undefined) {
    applyTheme(updates.theme);
  }
}

/**
 * Apply theme
 * @param {string} theme - Theme name ('light', 'dark', 'auto')
 */
export function applyTheme(theme) {
  const root = document.documentElement;

  if (theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

/**
 * Export data
 * @param {Store} store - App store
 * @returns {string} - JSON string
 */
export function exportData(store) {
  const state = store.getState();
  return JSON.stringify(state, null, 2);
}

/**
 * Import data
 * @param {Store} store - App store
 * @param {string} jsonData - JSON string
 */
export function importData(store, jsonData) {
  try {
    const data = JSON.parse(jsonData);
    store.setState(data);
    return true;
  } catch (error) {
    console.error('Failed to import data:', error);
    return false;
  }
}

/**
 * Send friend request
 * @param {Store} store - App store
 * @param {string} username - Username to send request to
 */
export function sendFriendRequest(store, username) {
  const friendRequests = store.getState('friendRequests') || [];
  
  // Check if already sent
  const exists = friendRequests.find(r => r.username === username);
  if (exists) {
    return false;
  }

  const request = {
    id: generateId('req'),
    username,
    timestamp: new Date().toISOString(),
    status: 'pending'
  };

  store.setState('friendRequests', [...friendRequests, request]);
  return true;
}

/**
 * Add friend
 * @param {Store} store - App store
 * @param {Object} friendData - Friend data
 */
export function addFriend(store, friendData) {
  const friends = store.getState('friends') || [];
  
  const friend = {
    id: generateId('user'),
    relationship: 'friend',
    ...friendData
  };

  store.setState('friends', [...friends, friend]);
  return friend;
}

/**
 * Remove friend
 * @param {Store} store - App store
 * @param {string} friendId - Friend ID
 */
export function removeFriend(store, friendId) {
  const friends = store.getState('friends') || [];
  const updated = friends.filter(f => f.id !== friendId);
  store.setState('friends', updated);
}

