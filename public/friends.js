// ===== Управление друзьями и DM =====
let friends = [];
let friendRequests = [];
let directMessages = [];
let currentDM = null;

// ===== Загрузка друзей =====
async function loadFriends() {
  try {
    const response = await fetch(`${API_BASE}/friends`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) throw new Error('Ошибка загрузки друзей');

    friends = await response.json();
    renderFriends();
  } catch (error) {
    console.error('Ошибка загрузки друзей:', error);
  }
}

// ===== Загрузка запросов в друзья =====
async function loadFriendRequests() {
  try {
    const response = await fetch(`${API_BASE}/friends/requests`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) throw new Error('Ошибка загрузки запросов');

    friendRequests = await response.json();
    renderFriendRequests();
    document.getElementById('requests-count').textContent = friendRequests.length;
  } catch (error) {
    console.error('Ошибка загрузки запросов:', error);
  }
}

// ===== Загрузка DM =====
async function loadDirectMessages() {
  try {
    const response = await fetch(`${API_BASE}/direct-messages`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) throw new Error('Ошибка загрузки DM');

    directMessages = await response.json();
    renderDMs();
  } catch (error) {
    console.error('Ошибка загрузки DM:', error);
  }
}

// ===== Отображение друзей =====
function renderFriends() {
  const friendsList = document.getElementById('friends-list');
  if (!friendsList) return;

  friendsList.innerHTML = '';

  friends.forEach(friend => {
    const friendItem = document.createElement('div');
    friendItem.className = 'friend-item';
    friendItem.dataset.friendId = friend.friend_id;

    const avatar = friend.avatar_url || '/default-avatar.png';
    const status = friend.status || 'offline';

    friendItem.innerHTML = `
      <div class="friend-avatar">
        <img src="${avatar}" alt="${friend.username}">
        <div class="dm-status ${status}"></div>
      </div>
      <div class="friend-info">
        <div class="friend-name">${escapeHtml(friend.username)}</div>
        <div class="friend-status-text">${friend.custom_status || status}</div>
      </div>
      <div class="friend-actions">
        <button class="friend-action-btn" title="Позвонить" onclick="callFriend(${friend.friend_id})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
        </button>
        <button class="friend-action-btn" title="Написать" onclick="openDM(${friend.friend_id})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>
    `;

    friendsList.appendChild(friendItem);
  });
}

// ===== Отображение запросов =====
function renderFriendRequests() {
  const requestsList = document.getElementById('friends-requests-list');
  if (!requestsList) return;

  requestsList.innerHTML = '';

  if (friendRequests.length === 0) {
    requestsList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">Нет запросов</div>';
    return;
  }

  friendRequests.forEach(request => {
    const requestItem = document.createElement('div');
    requestItem.className = 'request-item';

    const avatar = request.avatar_url || '/default-avatar.png';

    requestItem.innerHTML = `
      <div class="request-avatar">
        <img src="${avatar}" alt="${request.username}">
      </div>
      <div class="request-info">
        <div class="request-name">${escapeHtml(request.username)}</div>
        <div class="request-username">Хочет добавить вас в друзья</div>
      </div>
      <div class="request-actions">
        <button class="request-btn accept" onclick="acceptFriendRequest(${request.user_id})">Принять</button>
        <button class="request-btn decline" onclick="declineFriendRequest(${request.user_id})">Отклонить</button>
      </div>
    `;

    requestsList.appendChild(requestItem);
  });
}

// ===== Отображение DM =====
function renderDMs() {
  const dmList = document.getElementById('dm-list');
  if (!dmList) return;

  dmList.innerHTML = '';

  directMessages.forEach(dm => {
    const dmItem = document.createElement('div');
    dmItem.className = 'dm-item';
    dmItem.dataset.userId = dm.other_user_id;

    const avatar = dm.avatar_url || '/default-avatar.png';
    const status = dm.status || 'offline';

    dmItem.innerHTML = `
      <div class="dm-avatar">
        <img src="${avatar}" alt="${dm.username}">
        <div class="dm-status ${status}"></div>
      </div>
      <div class="dm-info">
        <div class="dm-name">${escapeHtml(dm.username)}</div>
        <div class="dm-preview">${escapeHtml(dm.last_message || 'Нет сообщений')}</div>
      </div>
    `;

    dmItem.addEventListener('click', () => openDM(dm.other_user_id));
    dmList.appendChild(dmItem);
  });
}

// ===== Открытие DM =====
async function openDM(userId) {
  currentDM = userId;
  currentChannel = null;
  currentServer = null;

  // Скрыть панель серверов, показать DM
  document.getElementById('dm-sidebar').classList.remove('hidden');
  document.getElementById('server-channels-sidebar').classList.add('hidden');
  document.getElementById('home-button').classList.add('active');

  // Скрыть welcome screen, показать сообщения
  const welcomeScreen = document.getElementById('welcome-screen');
  const messagesContainer = document.getElementById('messages-container');
  if (welcomeScreen) welcomeScreen.style.display = 'none';
  if (messagesContainer) messagesContainer.style.display = 'flex';

  // Обновить UI
  document.querySelectorAll('.dm-item').forEach(item => {
    item.classList.toggle('active', item.dataset.userId == userId);
  });

  // Загрузка сообщений
  await loadDMMessages(userId);

  // Обновить заголовок
  const user = directMessages.find(dm => dm.other_user_id === userId);
  if (user) {
    document.getElementById('current-channel-name').textContent = user.username;
  }
}

// ===== Загрузка сообщений DM =====
async function loadDMMessages(userId) {
  try {
    const response = await fetch(`${API_BASE}/direct-messages/${userId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) throw new Error('Ошибка загрузки сообщений');

    const data = await response.json();
    messages = data.messages.map(msg => ({
      id: msg.id,
      user_id: msg.sender_id,
      username: msg.sender_username,
      avatar_url: msg.sender_avatar,
      content: msg.content,
      created_at: msg.created_at,
      channel_id: null // DM не имеет channel_id
    }));

    renderMessages();
  } catch (error) {
    console.error('Ошибка загрузки DM сообщений:', error);
  }
}

// ===== Звонок другу =====
async function callFriend(userId) {
  if (!socket) {
    alert('Не подключено к серверу');
    return;
  }

  // Показать модальное окно звонка
  showCallModal(userId, 'outgoing');

  // Отправить запрос на звонок
  socket.emit('call-user', {
    targetUserId: userId,
    callType: 'voice'
  });
}

// ===== Принятие запроса в друзья =====
async function acceptFriendRequest(userId) {
  try {
    const response = await fetch(`${API_BASE}/friends/accept`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) throw new Error('Ошибка принятия запроса');

    await loadFriends();
    await loadFriendRequests();
  } catch (error) {
    console.error('Ошибка принятия запроса:', error);
    alert('Не удалось принять запрос');
  }
}

// ===== Отклонение запроса в друзья =====
async function declineFriendRequest(userId) {
  try {
    const response = await fetch(`${API_BASE}/friends/decline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) throw new Error('Ошибка отклонения запроса');

    await loadFriendRequests();
  } catch (error) {
    console.error('Ошибка отклонения запроса:', error);
    alert('Не удалось отклонить запрос');
  }
}

// ===== Показать модальное окно звонка =====
function showCallModal(userId, type) {
  const modal = document.getElementById('modal');
  const user = friends.find(f => f.friend_id === userId);
  const username = user ? user.username : 'Пользователь';

  modal.innerHTML = `
    <div class="call-modal">
      <div class="call-avatar">
        <img src="${user?.avatar_url || '/default-avatar.png'}" alt="${username}">
      </div>
      <div class="call-info">
        <h3>${escapeHtml(username)}</h3>
        <p id="call-status">${type === 'outgoing' ? 'Звонок...' : 'Входящий звонок'}</p>
      </div>
      <div class="call-controls">
        ${type === 'incoming' ? `
          <button class="call-btn accept" onclick="acceptCall(${userId})">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
        ` : ''}
        <button class="call-btn reject" onclick="endCall(${userId})">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

// ===== Принятие звонка =====
function acceptCall(userId) {
  if (!socket) return;

  socket.emit('accept-call', { targetUserId: userId });

  // Начать WebRTC соединение
  if (typeof initiateConnection === 'function') {
    initiateConnection(userId);
  }

  document.getElementById('call-status').textContent = 'Разговор';
}

// ===== Завершение звонка =====
function endCall(userId) {
  if (socket) {
    socket.emit('end-call', { targetUserId: userId });
  }

  closeModal();

  // Закрыть WebRTC соединение
  if (typeof leaveVoiceChannel === 'function') {
    leaveVoiceChannel();
  }
}

// ===== Поиск и добавление друга =====
async function searchFriend() {
  const username = document.getElementById('friend-username').value.trim();
  const resultsDiv = document.getElementById('friend-search-results');
  
  if (!username) {
    resultsDiv.innerHTML = '<p style="color: var(--accent-danger);">Введите имя пользователя</p>';
    return;
  }

  try {
    resultsDiv.innerHTML = '<p style="color: var(--text-muted);">Поиск...</p>';
    
    const response = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(username)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) throw new Error('Ошибка поиска');

    const users = await response.json();
    
    if (users.length === 0) {
      resultsDiv.innerHTML = '<p style="color: var(--text-muted);">Пользователь не найден</p>';
      return;
    }

    // Фильтруем себя и уже друзей
    const filteredUsers = users.filter(user => {
      if (user.id === currentUser.id) return false;
      const isFriend = friends.some(f => f.friend_id === user.id);
      return !isFriend;
    });

    if (filteredUsers.length === 0) {
      resultsDiv.innerHTML = '<p style="color: var(--text-muted);">Все найденные пользователи уже в друзьях или это вы</p>';
      return;
    }

    // Показываем результаты
    resultsDiv.innerHTML = filteredUsers.map(user => {
      const avatar = user.avatar_url || '/default-avatar.png';
      const isRequested = friendRequests.some(r => r.user_id === user.id);
      
      return `
        <div class="friend-search-result">
          <div class="friend-search-avatar">
            <img src="${avatar}" alt="${escapeHtml(user.username)}">
          </div>
          <div class="friend-search-info">
            <div class="friend-search-name">${escapeHtml(user.username)}</div>
            <div class="friend-search-username">${escapeHtml(user.email || '')}</div>
          </div>
          <button class="friend-search-action" 
                  onclick="sendFriendRequest(${user.id})" 
                  ${isRequested ? 'disabled' : ''}>
            ${isRequested ? 'Запрос отправлен' : 'Добавить в друзья'}
          </button>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Ошибка поиска:', error);
    resultsDiv.innerHTML = '<p style="color: var(--accent-danger);">Ошибка поиска пользователя</p>';
  }
}

// ===== Отправка запроса в друзья =====
async function sendFriendRequest(userId) {
  try {
    const response = await fetch(`${API_BASE}/friends/request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка отправки запроса');
    }

    // Обновить UI - найти все кнопки с этим userId
    const buttons = document.querySelectorAll(`button[onclick*="sendFriendRequest(${userId})"]`);
    buttons.forEach(button => {
      button.disabled = true;
      button.textContent = 'Запрос отправлен';
    });
    
    // Обновить список запросов
    await loadFriendRequests();
    
    // Перезагрузить результаты поиска
    const username = document.getElementById('friend-username').value.trim();
    if (username) {
      await searchFriend();
    }
    
    alert('Запрос в друзья отправлен!');
  } catch (error) {
    console.error('Ошибка отправки запроса:', error);
    alert(error.message || 'Не удалось отправить запрос');
  }
}

// ===== Показать модальное окно добавления друга =====
function showAddFriendModal() {
  document.getElementById('add-friend-modal').classList.remove('hidden');
  document.getElementById('friend-username').value = '';
  document.getElementById('friend-search-results').innerHTML = '';
  document.getElementById('friend-username').focus();
}

// ===== Закрыть модальное окно добавления друга =====
function closeAddFriendModal() {
  document.getElementById('add-friend-modal').classList.add('hidden');
}

// ===== Поиск по Enter =====
document.addEventListener('DOMContentLoaded', () => {
  const friendUsernameInput = document.getElementById('friend-username');
  if (friendUsernameInput) {
    friendUsernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchFriend();
      }
    });
  }

  // Закрытие по клику на overlay
  const addFriendModal = document.getElementById('add-friend-modal');
  if (addFriendModal) {
    addFriendModal.addEventListener('click', (e) => {
      if (e.target === addFriendModal) {
        closeAddFriendModal();
      }
    });
  }
});

// Экспорт для использования в других модулях
window.openDM = openDM;
window.callFriend = callFriend;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.acceptCall = acceptCall;
window.endCall = endCall;
window.showAddFriendModal = showAddFriendModal;
window.closeAddFriendModal = closeAddFriendModal;
window.searchFriend = searchFriend;
window.sendFriendRequest = sendFriendRequest;

