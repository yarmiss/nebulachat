// ===== Глобальные переменные =====
let currentUser = null;
let currentServer = null;
let currentChannel = null;
let servers = [];
let channels = [];
let messages = [];
let members = [];
let socket = null;
let accessToken = null;
let refreshToken = null;

// ===== API Base URL =====
const API_BASE = '/api';

// ===== Инициализация =====
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  checkAuth();
  setupEventListeners();
});

// ===== Canvas анимация фона =====
function initCanvas() {
  const canvas = document.getElementById('background-canvas');
  const ctx = canvas.getContext('2d');
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Простая анимация частиц
  const particles = [];
  const particleCount = 50;
  
  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.radius = Math.random() * 2 + 1;
    }
    
    update() {
      this.x += this.vx;
      this.y += this.vy;
      
      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
    
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(88, 101, 242, 0.3)';
      ctx.fill();
    }
  }
  
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach(particle => {
      particle.update();
      particle.draw();
    });
    
    requestAnimationFrame(animate);
  }
  
  animate();
}

// ===== Проверка аутентификации =====
function checkAuth() {
  accessToken = localStorage.getItem('accessToken');
  refreshToken = localStorage.getItem('refreshToken');
  
  if (accessToken) {
    verifyToken()
      .then(() => {
        showApp();
        initSocket();
        loadUserData();
      })
      .catch(() => {
        if (refreshToken) {
          refreshAccessToken()
            .then(() => {
              showApp();
              initSocket();
              loadUserData();
            })
            .catch(() => {
              showAuth();
            });
        } else {
          showAuth();
        }
      });
  } else {
    showAuth();
  }
}

// ===== Проверка токена =====
async function verifyToken() {
  const response = await fetch(`${API_BASE}/users/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Токен недействителен');
  }
  
  currentUser = await response.json();
  return currentUser;
}

// ===== Обновление access токена =====
async function refreshAccessToken() {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });
  
  if (!response.ok) {
    throw new Error('Не удалось обновить токен');
  }
  
  const data = await response.json();
  accessToken = data.accessToken;
  localStorage.setItem('accessToken', accessToken);
  return data;
}

// ===== Показать/скрыть экраны =====
function showAuth() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

// ===== Настройка обработчиков событий =====
function setupEventListeners() {
  // Переключение между входом и регистрацией
  document.getElementById('switch-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('auth-title').textContent = 'Создать аккаунт';
    document.getElementById('auth-subtitle').textContent = 'И начните общаться!';
    document.getElementById('auth-error').classList.add('hidden');
  });
  
  document.getElementById('switch-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('auth-title').textContent = 'Добро пожаловать!';
    document.getElementById('auth-subtitle').textContent = 'Мы рады видеть вас снова!';
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('password-match-error').classList.add('hidden');
  });

  // Проверка совпадения паролей при регистрации
  const registerPassword = document.getElementById('register-password');
  const registerPasswordConfirm = document.getElementById('register-password-confirm');
  const passwordMatchError = document.getElementById('password-match-error');

  if (registerPassword && registerPasswordConfirm) {
    registerPasswordConfirm.addEventListener('input', () => {
      if (registerPasswordConfirm.value && registerPassword.value !== registerPasswordConfirm.value) {
        passwordMatchError.textContent = 'Пароли не совпадают';
        passwordMatchError.classList.remove('hidden');
      } else {
        passwordMatchError.classList.add('hidden');
      }
    });

    registerPassword.addEventListener('input', () => {
      if (registerPasswordConfirm.value && registerPassword.value !== registerPasswordConfirm.value) {
        passwordMatchError.textContent = 'Пароли не совпадают';
        passwordMatchError.classList.remove('hidden');
      } else {
        passwordMatchError.classList.add('hidden');
      }
    });
  }
  
  // Форма входа
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });
  
  // Форма регистрации
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleRegister();
  });
  
  // Отправка сообщения
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Автоматическое изменение размера textarea
  const messageInput = document.getElementById('message-input');
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 200)}px`;
  });
  
  // Прикрепление файлов
  document.getElementById('attach-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  
  document.getElementById('file-input').addEventListener('change', handleFileSelect);
  
  // Кнопка "Друзья" (Home)
  document.getElementById('home-button').addEventListener('click', () => {
    document.getElementById('home-button').classList.add('active');
    document.querySelectorAll('.server-item').forEach(item => {
      item.classList.remove('active');
    });
    document.getElementById('dm-sidebar').classList.remove('hidden');
    document.getElementById('server-channels-sidebar').classList.add('hidden');
    currentServer = null;
    currentChannel = null;
    currentDM = null;
    document.getElementById('current-channel-name').textContent = 'Друзья';
    
    // Показать welcome screen
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('messages-container').style.display = 'none';
    messages = [];
  });

  // Добавление сервера
  document.getElementById('add-server-btn').addEventListener('click', () => {
    showCreateServerModal();
  });
  
  // Добавление канала
  document.getElementById('add-channel-btn').addEventListener('click', () => {
    if (currentServer) {
      showCreateChannelModal();
    }
  });

  // Переключение вкладок друзей
  document.querySelectorAll('.dm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabType = tab.dataset.tab;
      if (tabType === 'friends') {
        document.getElementById('friends-section').classList.remove('hidden');
        document.getElementById('friends-online-section').classList.add('hidden');
      } else {
        document.getElementById('friends-section').classList.add('hidden');
        document.getElementById('friends-online-section').classList.remove('hidden');
      }
    });
  });
  
  // Переключение панели участников
  document.getElementById('members-toggle-btn').addEventListener('click', () => {
    document.getElementById('members-sidebar').classList.toggle('hidden');
  });
  
  document.getElementById('close-members-btn').addEventListener('click', () => {
    document.getElementById('members-sidebar').classList.add('hidden');
  });
}

// ===== Обработка входа =====
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('auth-error');
  const submitBtn = document.getElementById('login-submit-btn');
  
  try {
    errorDiv.classList.add('hidden');
    
    // Блокировка кнопки во время отправки
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Вход...';
    
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка входа');
    }
    
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    currentUser = data.user;
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    
    showApp();
    initSocket();
    loadUserData();
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Войти';
  }
}

// ===== Обработка регистрации =====
async function handleRegister() {
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const passwordConfirm = document.getElementById('register-password-confirm').value;
  const errorDiv = document.getElementById('auth-error');
  const passwordMatchError = document.getElementById('password-match-error');
  const submitBtn = document.getElementById('register-submit-btn');
  
  try {
    errorDiv.classList.add('hidden');
    passwordMatchError.classList.add('hidden');
    
    // Проверка совпадения паролей
    if (password !== passwordConfirm) {
      passwordMatchError.textContent = 'Пароли не совпадают';
      passwordMatchError.classList.remove('hidden');
      return;
    }
    
    // Блокировка кнопки во время отправки
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Регистрация...';
    
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.errors?.join(', ') || 'Ошибка регистрации');
    }
    
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    currentUser = data.user;
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    
    showApp();
    initSocket();
    loadUserData();
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Продолжить';
  }
}

// ===== Инициализация Socket.IO =====
function initSocket() {
  if (socket) {
    socket.disconnect();
  }
  
  socket = io({
    auth: {
      token: accessToken
    }
  });
  
  // Socket события подключаются в socket-events.js
  if (typeof setupSocketEvents === 'function') {
    setupSocketEvents(socket);
  }
}

// ===== Загрузка данных пользователя =====
async function loadUserData() {
  try {
    // Обновление информации о пользователе в UI
    if (currentUser) {
      document.getElementById('user-name').textContent = currentUser.username;
      document.getElementById('user-status').textContent = currentUser.status || 'offline';
      if (currentUser.avatar_url) {
        document.getElementById('user-avatar-img').src = currentUser.avatar_url;
      }
    }
    
    // Загрузка друзей и DM
    if (typeof loadFriends === 'function') {
      await loadFriends();
      await loadFriendRequests();
      await loadDirectMessages();
    }
    
    // Загрузка серверов
    await loadServers();
    
    // Показать панель друзей по умолчанию
    document.getElementById('home-button').classList.add('active');
    
    // Показать welcome screen по умолчанию
    const welcomeScreen = document.getElementById('welcome-screen');
    const messagesContainer = document.getElementById('messages-container');
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (messagesContainer) messagesContainer.style.display = 'none';
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
  }
}

// ===== Загрузка серверов =====
async function loadServers() {
  try {
    const response = await fetch(`${API_BASE}/servers`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) throw new Error('Ошибка загрузки серверов');
    
    servers = await response.json();
    renderServers();
  } catch (error) {
    console.error('Ошибка загрузки серверов:', error);
  }
}

// ===== Отображение серверов =====
function renderServers() {
  const serverList = document.getElementById('server-list');
  serverList.innerHTML = '';
  
  servers.forEach(server => {
    const serverItem = document.createElement('div');
    serverItem.className = 'server-item';
    serverItem.dataset.serverId = server.id;
    
    if (server.icon_url) {
      serverItem.innerHTML = `<img src="${server.icon_url}" alt="${server.name}">`;
    } else {
      serverItem.textContent = server.name.charAt(0).toUpperCase();
    }
    
    serverItem.addEventListener('click', () => selectServer(server));
    serverList.appendChild(serverItem);
  });
}

// ===== Выбор сервера =====
async function selectServer(server) {
  currentServer = server;
  currentChannel = null;
  currentDM = null;
  
  // Обновление UI
  document.getElementById('home-button').classList.remove('active');
  document.querySelectorAll('.server-item').forEach(item => {
    item.classList.toggle('active', item.dataset.serverId == server.id);
  });
  
  // Показать панель каналов сервера, скрыть DM
  document.getElementById('dm-sidebar').classList.add('hidden');
  document.getElementById('server-channels-sidebar').classList.remove('hidden');
  
  document.getElementById('current-server-name').textContent = server.name;
  
  // Загрузка каналов
  await loadChannels(server.id);
  
  // Загрузка участников
  await loadMembers(server.id);
}

// ===== Загрузка каналов =====
async function loadChannels(serverId) {
  try {
    const response = await fetch(`${API_BASE}/channels/servers/${serverId}/channels`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) throw new Error('Ошибка загрузки каналов');
    
    channels = await response.json();
    renderChannels();
  } catch (error) {
    console.error('Ошибка загрузки каналов:', error);
  }
}

// ===== Отображение каналов =====
function renderChannels() {
  const channelsList = document.getElementById('channels-list');
  channelsList.innerHTML = '';
  
  const textChannels = channels.filter(c => c.type === 'text' || c.type === 'forum');
  const voiceChannels = channels.filter(c => c.type === 'voice' || c.type === 'video');
  
  if (textChannels.length > 0) {
    textChannels.forEach(channel => {
      const channelItem = document.createElement('div');
      channelItem.className = 'channel-item';
      channelItem.dataset.channelId = channel.id;
      channelItem.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>${channel.name}</span>
      `;
      
      channelItem.addEventListener('click', () => selectChannel(channel));
      channelsList.appendChild(channelItem);
    });
  }
  
  if (voiceChannels.length > 0) {
    voiceChannels.forEach(channel => {
      const channelItem = document.createElement('div');
      channelItem.className = 'channel-item';
      channelItem.dataset.channelId = channel.id;
      channelItem.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        </svg>
        <span>${channel.name}</span>
      `;
      
      channelItem.addEventListener('click', () => selectChannel(channel));
      channelsList.appendChild(channelItem);
    });
  }
}

// ===== Выбор канала =====
async function selectChannel(channel) {
  if (channel.type !== 'text' && channel.type !== 'forum') {
    // Для голосовых каналов - подключение к WebRTC
    if (typeof joinVoiceChannel === 'function') {
      joinVoiceChannel(channel);
    }
    return;
  }
  
  currentChannel = channel;
  currentDM = null;
  
  // Скрыть welcome screen, показать сообщения
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('messages-container').style.display = 'flex';
  
  // Обновление UI
  document.getElementById('current-channel-name').textContent = channel.name;
  document.querySelectorAll('.channel-item').forEach(item => {
    item.classList.toggle('active', item.dataset.channelId == channel.id);
  });
  
  // Присоединение к каналу через Socket.IO
  if (socket) {
    socket.emit('join-channel', { channelId: channel.id });
  }
  
  // Загрузка сообщений
  await loadMessages(channel.id);
}

// ===== Загрузка сообщений =====
async function loadMessages(channelId) {
  try {
    const response = await fetch(`${API_BASE}/messages/channels/${channelId}/messages`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) throw new Error('Ошибка загрузки сообщений');
    
    messages = await response.json();
    renderMessages();
  } catch (error) {
    console.error('Ошибка загрузки сообщений:', error);
  }
}

// ===== Отображение сообщений =====
function renderMessages() {
  const messagesList = document.getElementById('messages-list');
  if (!messagesList) return;
  
  messagesList.innerHTML = '';
  
  if (messages.length === 0) {
    // Показываем welcome screen если нет сообщений и нет активного канала/DM
    if (!currentChannel && !currentDM) {
      document.getElementById('welcome-screen').style.display = 'flex';
      document.getElementById('messages-container').style.display = 'none';
    } else {
      messagesList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Нет сообщений. Начните общение!</div>';
    }
    return;
  }
  
  // Скрываем welcome screen, показываем сообщения
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('messages-container').style.display = 'flex';
  
  messages.forEach(message => {
    const messageElement = createMessageElement(message);
    messagesList.appendChild(messageElement);
  });
  
  // Прокрутка вниз
  const container = document.getElementById('messages-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// ===== Создание элемента сообщения =====
function createMessageElement(message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  messageDiv.dataset.messageId = message.id;
  
  const avatar = message.avatar_url || '/default-avatar.png';
  const time = new Date(message.created_at).toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  messageDiv.innerHTML = `
    <div class="message-avatar">
      <img src="${avatar}" alt="${message.username}">
    </div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-author">${message.username}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-text ${message.edited_at ? 'edited' : ''}">${escapeHtml(message.content || '')}</div>
      ${message.attachments && message.attachments.length > 0 ? `
        <div class="message-attachments">
          ${message.attachments.map(att => {
            if (att.file_type.startsWith('image/')) {
              return `<div class="attachment"><img src="${att.file_url}" alt="${att.filename}"></div>`;
            } else if (att.file_type.startsWith('video/')) {
              return `<div class="attachment"><video controls src="${att.file_url}"></video></div>`;
            } else {
              return `<div class="attachment"><a href="${att.file_url}" target="_blank">${att.filename}</a></div>`;
            }
          }).join('')}
        </div>
      ` : ''}
      <div class="message-reactions" data-message-id="${message.id}"></div>
    </div>
  `;
  
  return messageDiv;
}

// ===== Отправка сообщения =====
async function sendMessage() {
  const messageInput = document.getElementById('message-input');
  const content = messageInput.value.trim();
  const files = document.getElementById('file-input').files;
  
  if (!content && files.length === 0) return;

  // Если это DM
  if (currentDM) {
    try {
      if (socket) {
        socket.emit('send-dm', {
          receiverId: currentDM,
          content: content
        });
      } else {
        // Fallback на REST API
        const formData = new FormData();
        formData.append('content', content);
        
        for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i]);
        }
        
        const response = await fetch(`${API_BASE}/direct-messages/${currentDM}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });
        
        if (!response.ok) throw new Error('Ошибка отправки сообщения');
      }
      
      // Очистка формы
      messageInput.value = '';
      messageInput.style.height = 'auto';
      document.getElementById('file-input').value = '';
      document.getElementById('attachments-preview').innerHTML = '';
    } catch (error) {
      console.error('Ошибка отправки DM:', error);
      alert('Не удалось отправить сообщение');
    }
    return;
  }

  // Если это канал сервера
  if (!currentChannel) return;
  
  try {
    const formData = new FormData();
    formData.append('content', content);
    
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    const response = await fetch(`${API_BASE}/messages/channels/${currentChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });
    
    if (!response.ok) throw new Error('Ошибка отправки сообщения');
    
    // Очистка формы
    messageInput.value = '';
    messageInput.style.height = 'auto';
    document.getElementById('file-input').value = '';
    document.getElementById('attachments-preview').innerHTML = '';
    
    // Сообщение будет добавлено через Socket.IO
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    alert('Не удалось отправить сообщение');
  }
}

// ===== Обработка выбора файлов =====
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  const preview = document.getElementById('attachments-preview');
  
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const previewDiv = document.createElement('div');
      previewDiv.className = 'attachment-preview';
      
      if (file.type.startsWith('image/')) {
        previewDiv.innerHTML = `
          <img src="${event.target.result}" alt="${file.name}">
          <button class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
      } else {
        previewDiv.innerHTML = `
          <div style="padding: 20px; text-align: center;">${file.name}</div>
          <button class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
      }
      
      preview.appendChild(previewDiv);
    };
    reader.readAsDataURL(file);
  });
}

// ===== Загрузка участников =====
async function loadMembers(serverId) {
  try {
    const response = await fetch(`${API_BASE}/servers/${serverId}/members`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) throw new Error('Ошибка загрузки участников');
    
    members = await response.json();
    renderMembers();
  } catch (error) {
    console.error('Ошибка загрузки участников:', error);
  }
}

// ===== Отображение участников =====
function renderMembers() {
  const membersList = document.getElementById('members-list');
  membersList.innerHTML = '';
  
  members.forEach(member => {
    const memberItem = document.createElement('div');
    memberItem.className = 'member-item';
    
    const avatar = member.avatar_url || '/default-avatar.png';
    const status = member.status || 'offline';
    
    memberItem.innerHTML = `
      <div class="member-avatar">
        <img src="${avatar}" alt="${member.username}">
        <div class="member-status-indicator ${status}"></div>
      </div>
      <div class="member-info">
        <div class="member-name">${member.nickname || member.username}</div>
      </div>
    `;
    
    membersList.appendChild(memberItem);
  });
}

// ===== Модальные окна =====
function showCreateServerModal() {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <h2>Создать сервер</h2>
    <form id="create-server-form">
      <div class="form-group">
        <label for="server-name">Название сервера</label>
        <input type="text" id="server-name" required>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button type="button" class="btn-secondary" onclick="closeModal()">Отмена</button>
        <button type="submit" class="btn-primary">Создать</button>
      </div>
    </form>
  `;
  
  document.getElementById('modal-overlay').classList.remove('hidden');
  
  document.getElementById('create-server-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('server-name').value;
    await createServer(name);
  });
}

function showCreateChannelModal() {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <h2>Создать канал</h2>
    <form id="create-channel-form">
      <div class="form-group">
        <label for="channel-name">Название канала</label>
        <input type="text" id="channel-name" required>
      </div>
      <div class="form-group">
        <label for="channel-type">Тип канала</label>
        <select id="channel-type">
          <option value="text">Текстовый</option>
          <option value="voice">Голосовой</option>
          <option value="video">Видео</option>
          <option value="forum">Форум</option>
        </select>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button type="button" class="btn-secondary" onclick="closeModal()">Отмена</button>
        <button type="submit" class="btn-primary">Создать</button>
      </div>
    </form>
  `;
  
  document.getElementById('modal-overlay').classList.remove('hidden');
  
  document.getElementById('create-channel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('channel-name').value;
    const type = document.getElementById('channel-type').value;
    await createChannel(name, type);
  });
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ===== Создание сервера =====
async function createServer(name) {
  try {
    const response = await fetch(`${API_BASE}/servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });
    
    if (!response.ok) throw new Error('Ошибка создания сервера');
    
    const server = await response.json();
    await loadServers();
    closeModal();
    selectServer(server);
  } catch (error) {
    console.error('Ошибка создания сервера:', error);
    alert('Не удалось создать сервер');
  }
}

// ===== Создание канала =====
async function createChannel(name, type) {
  try {
    const response = await fetch(`${API_BASE}/channels/servers/${currentServer.id}/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, type })
    });
    
    if (!response.ok) throw new Error('Ошибка создания канала');
    
    await loadChannels(currentServer.id);
    closeModal();
  } catch (error) {
    console.error('Ошибка создания канала:', error);
    alert('Не удалось создать канал');
  }
}

// ===== Утилиты =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Закрытие модального окна при клике на overlay =====
document.addEventListener('DOMContentLoaded', () => {
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }
});

// Экспорт для использования в других модулях
window.closeModal = closeModal;

