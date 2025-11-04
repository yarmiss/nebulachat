/**
 * UI Rendering
 * Functions to render different parts of the UI
 */

import {
  createServerIcon,
  createChannelItem,
  createMessage,
  createMemberItem
} from './components.js';

/**
 * Render server list
 * @param {Array} guilds - Guilds array
 * @param {string} currentGuildId - Current guild ID
 */
export function renderServerList(guilds, currentGuildId) {
  const container = document.getElementById('server-list-items');
  if (!container) return;

  container.innerHTML = '';

  guilds.forEach(guild => {
    const icon = createServerIcon(guild, guild.id === currentGuildId);
    container.appendChild(icon);
  });
}

/**
 * Render channel list
 * @param {Array} channels - Channels array
 * @param {string} guildId - Guild ID
 * @param {string} currentChannelId - Current channel ID
 */
export function renderChannelList(channels, guildId, currentChannelId) {
  const container = document.getElementById('channel-list');
  if (!container) return;

  container.innerHTML = '';

  // Filter channels for current guild
  const guildChannels = channels.filter(c => c.guild_id === guildId);

  // Group by category
  const categories = new Map();
  guildChannels.forEach(channel => {
    const category = channel.category || 'Без категории';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category).push(channel);
  });

  // Render categories
  categories.forEach((channelList, categoryName) => {
    const categoryEl = document.createElement('div');
    categoryEl.className = 'channel-category';

    // Category header
    const header = document.createElement('div');
    header.className = 'channel-category__header';

    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('width', '12');
    chevron.setAttribute('height', '12');
    chevron.classList.add('channel-category__icon');

    const chevronUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    chevronUse.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'icons.svg#chevron-down');
    chevron.appendChild(chevronUse);

    header.appendChild(chevron);
    header.appendChild(document.createTextNode(categoryName));

    // Toggle collapse
    header.addEventListener('click', () => {
      categoryEl.classList.toggle('channel-category--collapsed');
    });

    categoryEl.appendChild(header);

    // Channel items
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'channel-category__items';

    // Sort by position
    channelList.sort((a, b) => a.position - b.position);

    channelList.forEach(channel => {
      const item = createChannelItem(channel, channel.id === currentChannelId);
      itemsContainer.appendChild(item);
    });

    categoryEl.appendChild(itemsContainer);
    container.appendChild(categoryEl);
  });
}

/**
 * Render messages
 * @param {Array} messages - Messages array
 * @param {string} channelId - Channel ID
 * @param {Object} context - Render context (users, channels, etc.)
 */
export function renderMessages(messages, channelId, context = {}) {
  const container = document.getElementById('messages-list');
  if (!container) return;

  container.innerHTML = '';

  // Filter messages for current channel
  const channelMessages = messages
    .filter(m => m.channel_id === channelId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (channelMessages.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '20px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--color-text-muted)';
    empty.textContent = 'Нет сообщений';
    container.appendChild(empty);
    return;
  }

  // Render messages with grouping
  let previousMessage = null;

  channelMessages.forEach((message, index) => {
    const author = context.users?.find(u => u.id === message.author_id) || {
      id: message.author_id,
      username: 'Unknown User',
      avatar: null
    };

    // Check if should group with previous message
    const shouldGroup = previousMessage &&
      previousMessage.author_id === message.author_id &&
      (new Date(message.timestamp) - new Date(previousMessage.timestamp)) < 5 * 60 * 1000; // 5 minutes

    const messageEl = createMessage(message, author, shouldGroup, context);
    container.appendChild(messageEl);

    previousMessage = message;
  });

  // Scroll to bottom
  const scrollContainer = document.getElementById('messages-scroll');
  if (scrollContainer) {
    setTimeout(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }, 0);
  }
}

/**
 * Render members list
 * @param {Array} members - Members array
 * @param {string} guildId - Guild ID
 * @param {Array} roles - Roles array
 */
export function renderMembersList(members, guildId, roles = []) {
  const container = document.getElementById('members-list');
  if (!container) return;

  container.innerHTML = '';

  // Filter members for current guild
  const guildMembers = members.filter(m => m.guild_id === guildId);

  // Group by status
  const statusGroups = {
    online: [],
    idle: [],
    dnd: [],
    offline: []
  };

  guildMembers.forEach(member => {
    const status = member.status || 'offline';
    if (statusGroups[status]) {
      statusGroups[status].push(member);
    }
  });

  // Render groups
  const statusLabels = {
    online: 'В сети',
    idle: 'Не активны',
    dnd: 'Не беспокоить',
    offline: 'Не в сети'
  };

  Object.entries(statusGroups).forEach(([status, memberList]) => {
    if (memberList.length === 0) return;

    const group = document.createElement('div');
    group.className = 'members-group';

    const title = document.createElement('div');
    title.className = 'members-group__title';
    title.textContent = `${statusLabels[status]} — ${memberList.length}`;

    group.appendChild(title);

    // Sort by name
    memberList.sort((a, b) => a.username.localeCompare(b.username));

    memberList.forEach(member => {
      const item = createMemberItem(member);
      group.appendChild(item);
    });

    container.appendChild(group);
  });
}

/**
 * Update guild header
 * @param {Object} guild - Guild object
 */
export function updateGuildHeader(guild) {
  const header = document.getElementById('guild-header');
  if (!header) return;

  const nameEl = header.querySelector('.guild-header__name');
  if (nameEl && guild) {
    nameEl.textContent = guild.name;
  }
}

/**
 * Update channel header
 * @param {Object} channel - Channel object
 */
export function updateChannelHeader(channel) {
  const titleEl = document.getElementById('channel-name');
  if (titleEl && channel) {
    titleEl.textContent = channel.name;
  }

  // Update composer placeholder
  const composer = document.getElementById('message-input');
  if (composer && channel) {
    composer.dataset.placeholder = `Сообщение в #${channel.name}`;
  }
}

/**
 * Update user panel
 * @param {Object} user - User object
 */
export function updateUserPanel(user) {
  const nameEl = document.getElementById('user-name');
  const statusEl = document.getElementById('user-status');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl && user) {
    nameEl.textContent = user.username;
  }

  if (statusEl && user) {
    const statusText = {
      online: 'онлайн',
      idle: 'не активен',
      dnd: 'не беспокоить',
      offline: 'не в сети'
    };
    statusEl.textContent = statusText[user.status] || 'онлайн';
  }

  if (avatarEl && user) {
    import('../utils/helpers.js').then(({ stringToColor, getInitials }) => {
      avatarEl.style.background = stringToColor(user.username);
      if (user.avatar) {
        avatarEl.style.backgroundImage = `url(${user.avatar})`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.textContent = '';
      } else {
        avatarEl.textContent = getInitials(user.username);
      }
    });
  }
}

/**
 * Toggle members sidebar
 */
export function toggleMembersSidebar() {
  const sidebar = document.getElementById('members-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('is-open');
  }
}

/**
 * Toggle channel sidebar (mobile)
 */
export function toggleChannelSidebar() {
  const sidebar = document.querySelector('.channel-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('is-open');
  }
}

