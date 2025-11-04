// ===== Настройка Socket.IO событий =====
function setupSocketEvents(socket) {
  // Подключение
  socket.on('connect', () => {
    console.log('Подключено к серверу');
    
    // Присоединение к текущему каналу, если есть
    if (currentChannel) {
      socket.emit('join-channel', { channelId: currentChannel.id });
    }
  });
  
  // Отключение
  socket.on('disconnect', () => {
    console.log('Отключено от сервера');
  });
  
  // Ошибки
  socket.on('error', (error) => {
    console.error('Ошибка Socket.IO:', error);
    alert(error.message || 'Ошибка подключения');
  });
  
  // Присоединение к каналу
  socket.on('channel-joined', ({ channelId }) => {
    console.log(`Присоединено к каналу ${channelId}`);
  });
  
  // Пользователь присоединился
  socket.on('user-joined', ({ userId, username, timestamp }) => {
    console.log(`Пользователь ${username} присоединился`);
    // Можно показать уведомление
  });
  
  // Пользователь покинул
  socket.on('user-left', ({ userId, timestamp }) => {
    console.log(`Пользователь ${userId} покинул канал`);
  });
  
  // Новое сообщение
  socket.on('new-message', (message) => {
    if (currentChannel && message.channel_id === currentChannel.id) {
      addMessageToUI(message);
      scrollToBottom();
    }
  });
  
  // Сообщение отредактировано
  socket.on('message-edited', (message) => {
    if (currentChannel && message.channel_id === currentChannel.id) {
      updateMessageInUI(message);
    }
  });
  
  // Сообщение удалено
  socket.on('message-deleted', ({ messageId }) => {
    removeMessageFromUI(messageId);
  });
  
  // Пользователь печатает
  socket.on('user-typing', ({ userId, username }) => {
    if (currentChannel) {
      showTypingIndicator(userId, username);
    }
  });
  
  // Пользователь перестал печатать
  socket.on('user-stop-typing', ({ userId }) => {
    hideTypingIndicator(userId);
  });
  
  // Реакция добавлена
  socket.on('reaction-added', ({ messageId, reactions, userId, emoji }) => {
    updateMessageReactions(messageId, reactions);
  });
  
  // Изменение статуса пользователя
  socket.on('user-status-changed', ({ userId, status }) => {
    updateUserStatus(userId, status);
  });
  
  // Пользователь онлайн
  socket.on('user-online', ({ userId }) => {
    updateUserStatus(userId, 'online');
  });
  
  // Пользователь оффлайн
  socket.on('user-offline', ({ userId }) => {
    updateUserStatus(userId, 'offline');
  });
  
  // WebRTC события (обрабатываются в webrtc.js)
  setupWebRTCSocketEvents(socket);
}

// ===== Добавление сообщения в UI =====
function addMessageToUI(message) {
  const messagesList = document.getElementById('messages-list');
  const messageElement = createMessageElement(message);
  messagesList.appendChild(messageElement);
  
  // Проверка на дубликаты
  const existing = messages.find(m => m.id === message.id);
  if (!existing) {
    messages.push(message);
  }
}

// ===== Обновление сообщения в UI =====
function updateMessageInUI(message) {
  const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
  if (messageElement) {
    const textElement = messageElement.querySelector('.message-text');
    if (textElement) {
      textElement.textContent = message.content;
      textElement.classList.add('edited');
    }
  }
  
  // Обновление в массиве
  const index = messages.findIndex(m => m.id === message.id);
  if (index !== -1) {
    messages[index] = message;
  }
}

// ===== Удаление сообщения из UI =====
function removeMessageFromUI(messageId) {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageElement) {
    messageElement.remove();
  }
  
  // Удаление из массива
  messages = messages.filter(m => m.id !== messageId);
}

// ===== Индикатор печати =====
let typingUsersMap = new Map();
let typingTimeout = null;

function showTypingIndicator(userId, username) {
  typingUsersMap.set(userId, username);
  updateTypingIndicator();
  
  // Автоматическое скрытие через 3 секунды
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingUsersMap.clear();
    updateTypingIndicator();
  }, 3000);
}

function hideTypingIndicator(userId) {
  typingUsersMap.delete(userId);
  updateTypingIndicator();
}

function updateTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  const usersSpan = document.getElementById('typing-users');
  
  if (typingUsersMap.size === 0) {
    indicator.style.display = 'none';
  } else {
    indicator.style.display = 'block';
    const users = Array.from(typingUsersMap.values());
    if (users.length === 1) {
      usersSpan.textContent = users[0];
    } else if (users.length === 2) {
      usersSpan.textContent = `${users[0]} и ${users[1]}`;
    } else {
      usersSpan.textContent = `${users[0]} и ещё ${users.length - 1}`;
    }
  }
}

// ===== Обработка печати =====
let typingTimeoutId = null;

function handleTyping() {
  if (!currentChannel) return;
  
  if (socket) {
    socket.emit('start-typing', { channelId: currentChannel.id });
    
    // Остановка печати через 3 секунды бездействия
    clearTimeout(typingTimeoutId);
    typingTimeoutId = setTimeout(() => {
      if (socket) {
        socket.emit('stop-typing', { channelId: currentChannel.id });
      }
    }, 3000);
  }
}

// Привязка к textarea
document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('message-input');
  if (messageInput) {
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('blur', () => {
      if (socket && currentChannel) {
        socket.emit('stop-typing', { channelId: currentChannel.id });
      }
    });
  }
});

// ===== Обновление реакций на сообщении =====
function updateMessageReactions(messageId, reactions) {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageElement) return;
  
  const reactionsContainer = messageElement.querySelector('.message-reactions');
  if (!reactionsContainer) return;
  
  reactionsContainer.innerHTML = '';
  
  reactions.forEach(reaction => {
    const reactionElement = document.createElement('div');
    reactionElement.className = 'reaction';
    reactionElement.innerHTML = `
      <span>${reaction.emoji}</span>
      <span class="reaction-count">${reaction.count}</span>
    `;
    
    reactionElement.addEventListener('click', () => {
      if (socket) {
        socket.emit('add-reaction', { messageId, emoji: reaction.emoji });
      }
    });
    
    reactionsContainer.appendChild(reactionElement);
  });
}

// ===== Обновление статуса пользователя =====
function updateUserStatus(userId, status) {
  // Обновление в списке участников
  const memberItem = document.querySelector(`[data-user-id="${userId}"]`);
  if (memberItem) {
    const indicator = memberItem.querySelector('.member-status-indicator');
    if (indicator) {
      indicator.className = `member-status-indicator ${status}`;
    }
  }
  
  // Обновление собственного статуса
  if (currentUser && currentUser.id === userId) {
    document.getElementById('user-status').textContent = status;
  }
}

// ===== Прокрутка вниз =====
function scrollToBottom() {
  const container = document.getElementById('messages-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

  // Новое DM сообщение
  socket.on('new-dm', (message) => {
    if (typeof currentDM !== 'undefined' && currentDM && 
        (message.sender_id === currentDM || message.receiver_id === currentDM)) {
      addMessageToUI(message);
      scrollToBottom();
    }
    
    // Обновить список DM
    if (typeof loadDirectMessages === 'function') {
      loadDirectMessages();
    }
  });

  // Входящий звонок
  socket.on('incoming-call', ({ fromUserId, fromUsername, callType }) => {
    if (typeof showCallModal === 'function') {
      showCallModal(fromUserId, 'incoming');
    }
  });

  // Звонок принят
  socket.on('call-accepted', ({ fromUserId }) => {
    const callStatus = document.getElementById('call-status');
    if (callStatus) {
      callStatus.textContent = 'Разговор';
    }
    
    // Начать WebRTC соединение
    if (typeof initiateConnection === 'function') {
      initiateConnection(fromUserId);
    }
  });

  // Звонок отклонен
  socket.on('call-rejected', ({ fromUserId }) => {
    if (typeof closeModal === 'function') {
      closeModal();
    }
    alert('Звонок отклонен');
  });

  // Звонок завершен
  socket.on('call-ended', ({ fromUserId }) => {
    if (typeof closeModal === 'function') {
      closeModal();
    }
    
    // Закрыть WebRTC соединение
    if (typeof leaveVoiceChannel === 'function') {
      leaveVoiceChannel();
    }
  });

  // Ошибка звонка
  socket.on('call-error', ({ message }) => {
    alert(message || 'Ошибка звонка');
    if (typeof closeModal === 'function') {
      closeModal();
    }
  });

// ===== WebRTC Socket события =====
function setupWebRTCSocketEvents(socket) {
  // Эти события будут обрабатываться в webrtc.js
  // Здесь просто передаем socket для использования
  if (typeof initWebRTC === 'function') {
    initWebRTC(socket);
  }
}

