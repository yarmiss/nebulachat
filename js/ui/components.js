/**
 * UI Components
 * Reusable UI component builders
 */

import { formatTimestamp, stringToColor, getInitials, createElement } from '../utils/helpers.js';
import { parseMessage } from '../utils/markdown.js';

/**
 * Create server icon element
 * @param {Object} guild - Guild object
 * @param {boolean} active - Is active
 * @returns {HTMLElement}
 */
export function createServerIcon(guild, active = false) {
  const button = createElement('button', {
    className: `server-icon ${active ? 'server-icon--active' : ''}`,
    'aria-label': guild.name,
    'data-guild-id': guild.id
  });

  if (guild.icon) {
    const img = createElement('img', {
      src: guild.icon,
      alt: guild.name
    });
    button.appendChild(img);
  } else {
    button.style.background = stringToColor(guild.name);
    button.textContent = getInitials(guild.name);
  }

  return button;
}

/**
 * Create channel item element
 * @param {Object} channel - Channel object
 * @param {boolean} active - Is active
 * @returns {HTMLElement}
 */
export function createChannelItem(channel, active = false) {
  const item = createElement('div', {
    className: `channel-item ${active ? 'channel-item--active' : ''}`,
    'data-channel-id': channel.id,
    role: 'listitem'
  });

  // Icon
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.classList.add('channel-item__icon');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS(
    'http://www.w3.org/1999/xlink',
    'href',
    channel.type === 'voice' ? 'icons.svg#volume' : 'icons.svg#hashtag'
  );
  icon.appendChild(use);

  item.appendChild(icon);

  // Name
  const name = createElement('span', {
    className: 'channel-item__name'
  }, channel.name);

  item.appendChild(name);

  // Unread badge
  if (channel.unread && channel.unread_count) {
    const badge = createElement('span', {
      className: 'channel-item__badge'
    }, channel.unread_count.toString());
    item.appendChild(badge);
  } else if (channel.unread) {
    const unreadDot = createElement('div', {
      className: 'channel-item__unread'
    });
    item.appendChild(unreadDot);
  }

  return item;
}

/**
 * Create message element
 * @param {Object} message - Message object
 * @param {Object} author - Author user object
 * @param {boolean} grouped - Is grouped with previous
 * @param {Object} context - Parse context
 * @returns {HTMLElement}
 */
export function createMessage(message, author, grouped = false, context = {}) {
  const messageEl = createElement('div', {
    className: `message ${grouped ? 'message--grouped' : ''}`,
    'data-message-id': message.id
  });

  // Avatar
  const avatar = createElement('div', {
    className: 'message__avatar'
  });
  avatar.style.background = stringToColor(author.username);

  if (author.avatar) {
    const img = createElement('img', {
      src: author.avatar,
      alt: author.username
    });
    avatar.appendChild(img);
  } else if (!grouped) {
    avatar.textContent = getInitials(author.username);
  }

  messageEl.appendChild(avatar);

  // Content wrapper
  const contentWrapper = createElement('div', {
    className: 'message__content-wrapper'
  });

  // Header (author + timestamp)
  if (!grouped) {
    const header = createElement('div', {
      className: 'message__header'
    });

    const authorEl = createElement('span', {
      className: 'message__author',
      'data-user-id': author.id
    }, author.username);

    const timestamp = createElement('span', {
      className: 'message__timestamp'
    }, formatTimestamp(message.timestamp, 'time'));

    header.appendChild(authorEl);
    header.appendChild(timestamp);
    contentWrapper.appendChild(header);
  } else {
    // Grouped message timestamp (shown on hover)
    const timestamp = createElement('span', {
      className: 'message__timestamp'
    }, formatTimestamp(message.timestamp, 'time'));
    contentWrapper.appendChild(timestamp);
  }

  // Text content
  const textEl = createElement('div', {
    className: `message__text ${message.edited ? 'message__text--edited' : ''}`
  });

  const parsedContent = parseMessage(message.content, context);
  textEl.innerHTML = parsedContent;

  contentWrapper.appendChild(textEl);

  // Reactions
  if (message.reactions && message.reactions.length > 0) {
    const reactionsEl = createElement('div', {
      className: 'message__reactions'
    });

    message.reactions.forEach(reaction => {
      const reactionEl = createReaction(reaction);
      reactionsEl.appendChild(reactionEl);
    });

    contentWrapper.appendChild(reactionsEl);
  }

  messageEl.appendChild(contentWrapper);

  // Message actions (shown on hover)
  const actions = createMessageActions();
  messageEl.appendChild(actions);

  return messageEl;
}

/**
 * Create message actions toolbar
 * @returns {HTMLElement}
 */
export function createMessageActions() {
  const actions = createElement('div', {
    className: 'message__actions'
  });

  const actionButtons = [
    { icon: 'reply', label: 'Ответить', action: 'reply' },
    { icon: 'smile', label: 'Добавить реакцию', action: 'react' },
    { icon: 'edit', label: 'Изменить', action: 'edit' },
    { icon: 'more-vertical', label: 'Ещё', action: 'more' }
  ];

  actionButtons.forEach(({ icon, label, action }) => {
    const button = createElement('button', {
      className: 'message__action-btn',
      'aria-label': label,
      'data-action': action
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `icons.svg#${icon}`);
    svg.appendChild(use);

    button.appendChild(svg);
    actions.appendChild(button);
  });

  return actions;
}

/**
 * Create reaction element
 * @param {Object} reaction - Reaction object
 * @returns {HTMLElement}
 */
export function createReaction(reaction) {
  const reactionEl = createElement('button', {
    className: 'reaction',
    'data-emoji': reaction.emoji
  });

  const emoji = createElement('span', {
    className: 'reaction__emoji'
  }, reaction.emoji);

  const count = createElement('span', {
    className: 'reaction__count'
  }, reaction.count.toString());

  reactionEl.appendChild(emoji);
  reactionEl.appendChild(count);

  return reactionEl;
}

/**
 * Create member list item
 * @param {Object} member - Member object
 * @returns {HTMLElement}
 */
export function createMemberItem(member) {
  const item = createElement('div', {
    className: 'member-item',
    'data-user-id': member.id
  });

  // Avatar with status
  const avatar = createElement('div', {
    className: 'member-item__avatar'
  });
  avatar.style.background = stringToColor(member.username);

  if (member.avatar) {
    const img = createElement('img', {
      src: member.avatar,
      alt: member.username
    });
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitials(member.username);
  }

  // Status indicator
  const status = createElement('div', {
    className: `member-item__status member-item__status--${member.status || 'offline'}`
  });
  avatar.appendChild(status);

  item.appendChild(avatar);

  // Name
  const name = createElement('div', {
    className: 'member-item__name'
  }, member.username);

  item.appendChild(name);

  return item;
}

/**
 * Create toast notification
 * @param {string} message - Message text
 * @param {string} type - Toast type ('success', 'error', 'warning', 'info')
 * @returns {HTMLElement}
 */
export function createToast(message, type = 'info') {
  const toast = createElement('div', {
    className: `toast toast--${type}`
  }, message);

  return toast;
}

/**
 * Show toast notification
 * @param {string} message - Message text
 * @param {string} type - Toast type
 * @param {number} duration - Duration in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = createToast(message, type);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Create skeleton loader
 * @param {string} type - Skeleton type
 * @returns {HTMLElement}
 */
export function createSkeleton(type = 'message') {
  if (type === 'message') {
    const skeleton = createElement('div', {
      className: 'message'
    });

    const avatar = createElement('div', {
      className: 'skeleton',
      style: 'width: 40px; height: 40px; border-radius: 50%;'
    });

    const content = createElement('div', { style: 'flex: 1;' });

    const line1 = createElement('div', {
      className: 'skeleton',
      style: 'width: 200px; height: 16px; margin-bottom: 8px;'
    });

    const line2 = createElement('div', {
      className: 'skeleton',
      style: 'width: 100%; height: 14px;'
    });

    content.appendChild(line1);
    content.appendChild(line2);

    skeleton.appendChild(avatar);
    skeleton.appendChild(content);

    return skeleton;
  }

  return createElement('div', { className: 'skeleton' });
}

/**
 * Create context menu
 * @param {Array} items - Menu items
 * @returns {HTMLElement}
 */
export function createContextMenu(items) {
  const menu = createElement('div', {
    className: 'context-menu',
    role: 'menu'
  });

  items.forEach(item => {
    if (item.separator) {
      const separator = createElement('div', {
        className: 'context-menu__separator'
      });
      menu.appendChild(separator);
    } else {
      const menuItem = createElement('div', {
        className: `context-menu__item ${item.danger ? 'context-menu__item--danger' : ''}`,
        role: 'menuitem',
        'data-action': item.action
      });

      if (item.icon) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');

        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `icons.svg#${item.icon}`);
        svg.appendChild(use);

        menuItem.appendChild(svg);
      }

      const text = document.createTextNode(item.label);
      menuItem.appendChild(text);

      if (item.onClick) {
        menuItem.addEventListener('click', item.onClick);
      }

      menu.appendChild(menuItem);
    }
  });

  return menu;
}

/**
 * Show context menu at position
 * @param {Array} items - Menu items
 * @param {number} x - X position
 * @param {number} y - Y position
 */
export function showContextMenu(items, x, y) {
  // Remove existing menu
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();

  const menu = createContextMenu(items);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'block';

  document.body.appendChild(menu);

  // Close on click outside
  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 0);

  // Adjust position if off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${x - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${y - rect.height}px`;
  }
}

