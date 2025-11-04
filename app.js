/**
 * NebulaChat - Real-time Chat with Friend Codes
 */

console.log('Loading NebulaChat app.js...');

import { Router } from './js/core/router.js';
import { Store } from './js/core/store.js';
import { WebSocketClient } from './js/core/websocket.js';
import { WebRTCClient } from './js/core/webrtc.js';

import { showToast } from './js/ui/components.js';
import { stringToColor, getInitials, copyToClipboard } from './js/utils/helpers.js';

console.log('All imports loaded successfully');

const WS_URL = window.location.protocol === 'https:' 
  ? `wss://${window.location.host}/ws`
  : 'ws://localhost:8787/ws';

class App {
  constructor() {
    this.store = new Store();
    this.router = new Router();
    this.ws = null;
    this.webrtc = null;
    this.currentUser = null;
    this.userCode = null;
    this.currentDmUserId = null;
  }

  async init() {
    console.log('Initializing NebulaChat...');

    try {
      await this.loadSvgSprite();
      console.log('SVG sprite loaded');
      
      // Получаем или создаем уникальный код пользователя
      this.userCode = this.getOrCreateUserCode();
      console.log('User code:', this.userCode);
      
      // Устанавливаем никнейм
      const nickname = this.getUserNickname();
      console.log('Nickname:', nickname);
      
      this.currentUser = {
        id: this.userCode,
        username: nickname,
        status: 'online'
      };

      this.store.setState('user', this.currentUser);
      this.store.setState('friends', []);
      this.store.setState('messages', []);

      // Показываем код пользователя
      this.updateUserPanel();
      console.log('User panel updated');

      // Подключаемся к WebSocket
      this.setupWebSocket();
      console.log('WebSocket setup complete');

      // Настраиваем UI
      this.setupEventListeners();
      console.log('Event listeners setup complete');

      // Показываем главную страницу
      this.showHomeView();
      console.log('Home view shown');

      showToast(`Добро пожаловать в NebulaChat!`, 'success', 3000);
    } catch (error) {
      console.error('Error during initialization:', error);
      alert('Ошибка инициализации: ' + error.message);
    }
  }

  getOrCreateUserCode() {
    let code = localStorage.getItem('nebulachat_user_code');
    
    if (!code) {
      // Генерируем уникальный код
      code = this.generateUniqueCode();
      localStorage.setItem('nebulachat_user_code', code);
    }

    return code;
  }

  generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getUserNickname() {
    let nickname = localStorage.getItem('nebulachat_nickname');
    
    if (!nickname) {
      nickname = `User${Math.floor(Math.random() * 9999)}`;
      localStorage.setItem('nebulachat_nickname', nickname);
    }

    return nickname;
  }

  setUserNickname(newNickname) {
    if (!newNickname || newNickname.length < 2) {
      showToast('Никнейм должен быть минимум 2 символа', 'error');
      return false;
    }

    localStorage.setItem('nebulachat_nickname', newNickname);
    this.currentUser.username = newNickname;
    this.updateUserPanel();

    // Отправляем обновление на сервер
    if (this.ws && this.ws.isConnected()) {
      this.ws.send('NICKNAME_UPDATE', {
        nickname: newNickname
      });
    }

    showToast('Никнейм обновлен', 'success');
    return true;
  }

  setupWebSocket() {
    this.ws = new WebSocketClient(WS_URL);
    this.webrtc = new WebRTCClient(this.ws);

    // События подключения
    this.ws.addEventListener('open', () => {
      console.log('WebSocket connected');
      showToast('Подключено к серверу', 'success', 2000);

      // Отправляем свой код и никнейм
      this.ws.send('USER_REGISTER', {
        userCode: this.userCode,
        username: this.currentUser.username
      });
    });

    this.ws.addEventListener('close', () => {
      console.log('WebSocket disconnected');
      showToast('Отключено от сервера. Переподключение...', 'warning', 2000);
    });

    // События сообщений
    this.ws.on('USER_REGISTERED', (payload) => {
      console.log('User registered:', payload);
    });

    this.ws.on('FRIENDS_LIST', (payload) => {
      console.log('Friends list:', payload);
      this.store.setState('friends', payload.friends || []);
      this.renderFriends();
    });

    this.ws.on('FRIEND_ADDED', (payload) => {
      console.log('Friend added:', payload);
      const friends = this.store.getState('friends') || [];
      friends.push(payload.friend);
      this.store.setState('friends', friends);
      this.renderFriends();
      showToast(`${payload.friend.username} добавлен в друзья!`, 'success');
    });

    this.ws.on('FRIEND_ONLINE', (payload) => {
      const friends = this.store.getState('friends') || [];
      const friend = friends.find(f => f.id === payload.userId);
      if (friend) {
        friend.status = 'online';
        this.store.setState('friends', friends);
        this.renderFriends();
      }
    });

    this.ws.on('FRIEND_OFFLINE', (payload) => {
      const friends = this.store.getState('friends') || [];
      const friend = friends.find(f => f.id === payload.userId);
      if (friend) {
        friend.status = 'offline';
        this.store.setState('friends', friends);
        this.renderFriends();
      }
    });

    this.ws.on('MESSAGE_CREATE', (payload) => {
      const messages = this.store.getState('messages') || [];
      messages.push(payload);
      this.store.setState('messages', messages);
      this.renderMessages();
    });

    // WebRTC сигналинг
    this.ws.on('INCOMING_CALL', async (payload) => {
      const { callerId, offer, callType } = payload;
      const friends = this.store.getState('friends') || [];
      const caller = friends.find(f => f.id === callerId);
      
      if (confirm(`Входящий ${callType === 'video' ? 'видеозвонок' : 'звонок'} от ${caller?.username || callerId}. Принять?`)) {
        await this.answerCall(offer, callerId, callType);
      }
    });

    this.ws.on('CALL_ANSWERED', async (payload) => {
      await this.webrtc.handleAnswer(payload.answer);
    });

    this.ws.on('ICE_CANDIDATE', async (payload) => {
      await this.webrtc.handleIceCandidate(payload.candidate);
    });

    this.ws.on('CALL_ENDED', () => {
      this.endCall();
      showToast('Звонок завершен', 'info');
    });

    // WebRTC события
    this.webrtc.on('remoteStream', (stream) => {
      const remoteVideo = document.getElementById('remote-video');
      remoteVideo.srcObject = stream;
      document.getElementById('call-status').style.display = 'none';
    });

    this.webrtc.on('connected', () => {
      document.getElementById('call-status').textContent = 'Подключено';
      setTimeout(() => {
        document.getElementById('call-status').style.display = 'none';
      }, 2000);
    });

    this.webrtc.on('callEnded', () => {
      this.endCall();
    });

    // Подключаемся
    this.ws.connect(this.userCode);
  }

  setupEventListeners() {
    // Home button
    document.getElementById('home-btn')?.addEventListener('click', () => {
      this.showHomeView();
    });

    // Copy code button
    document.getElementById('copy-code-btn')?.addEventListener('click', async () => {
      const success = await copyToClipboard(this.userCode);
      if (success) {
        showToast('Код скопирован!', 'success', 2000);
      } else {
        showToast('Ошибка копирования', 'error');
      }
    });

    // Add friend button
    document.getElementById('add-friend-btn')?.addEventListener('click', () => {
      this.showAddFriendModal();
    });

    // Settings button
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      this.showSettingsModal();
    });

    // Voice/Video call buttons
    document.getElementById('voice-call-btn')?.addEventListener('click', () => {
      this.startCall('audio');
    });

    document.getElementById('video-call-btn')?.addEventListener('click', () => {
      this.startCall('video');
    });

    // Call controls
    document.getElementById('toggle-mic-btn')?.addEventListener('click', () => {
      const enabled = this.webrtc.toggleAudio();
      document.getElementById('toggle-mic-btn').classList.toggle('muted', !enabled);
    });

    document.getElementById('toggle-video-btn')?.addEventListener('click', () => {
      const enabled = this.webrtc.toggleVideo();
      document.getElementById('toggle-video-btn').classList.toggle('muted', !enabled);
    });

    document.getElementById('share-screen-btn')?.addEventListener('click', async () => {
      await this.webrtc.shareScreen();
    });

    document.getElementById('end-call-btn')?.addEventListener('click', () => {
      this.webrtc.endCall();
    });

    // Message input
    const input = document.getElementById('message-input');
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  showAddFriendModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');

    modal.innerHTML = `
      <div class="modal__header">
        <h2 class="modal__title">Добавить друга</h2>
        <button class="modal__close" onclick="document.getElementById('modal-overlay').style.display='none'">
          <svg width="24" height="24"><use href="icons.svg#x"></use></svg>
        </button>
      </div>
      <div class="modal__body">
        <div class="form-group">
          <label class="form-label">Код друга</label>
          <input type="text" class="form-input" id="friend-code-input" placeholder="Введите 8-значный код" maxlength="8" style="text-transform: uppercase;">
        </div>
        <p style="font-size: 14px; color: var(--color-text-muted); margin-top: 8px;">
          Попросите друга поделиться своим кодом. Он находится в левом нижнем углу.
        </p>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary" onclick="document.getElementById('modal-overlay').style.display='none'">Отмена</button>
        <button class="btn btn--primary" id="add-friend-submit">Добавить</button>
      </div>
    `;

    modalOverlay.style.display = 'flex';

    document.getElementById('add-friend-submit').onclick = () => {
      this.addFriendByCode();
    };

    // Auto uppercase
    document.getElementById('friend-code-input').oninput = (e) => {
      e.target.value = e.target.value.toUpperCase();
    };
  }

  addFriendByCode() {
    const input = document.getElementById('friend-code-input');
    const code = input.value.trim().toUpperCase();

    if (code.length !== 8) {
      showToast('Код должен быть 8 символов', 'error');
      return;
    }

    if (code === this.userCode) {
      showToast('Вы не можете добавить себя в друзья', 'error');
      return;
    }

    // Отправляем запрос на добавление
    if (this.ws && this.ws.isConnected()) {
      this.ws.send('ADD_FRIEND', { friendCode: code });
      document.getElementById('modal-overlay').style.display = 'none';
      showToast('Запрос отправлен...', 'info', 2000);
    } else {
      showToast('Нет подключения к серверу', 'error');
    }
  }

  showSettingsModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');

    modal.innerHTML = `
      <div class="modal__header">
        <h2 class="modal__title">Настройки</h2>
        <button class="modal__close" onclick="document.getElementById('modal-overlay').style.display='none'">
          <svg width="24" height="24"><use href="icons.svg#x"></use></svg>
        </button>
      </div>
      <div class="modal__body">
        <div class="form-group">
          <label class="form-label">Никнейм</label>
          <input type="text" class="form-input" id="nickname-input" value="${this.currentUser.username}" placeholder="Ваше имя">
        </div>
        <div class="form-group">
          <label class="form-label">Ваш код</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" class="form-input" value="${this.userCode}" readonly style="font-family: monospace; font-weight: bold; color: var(--color-brand);">
            <button class="btn btn--secondary" id="copy-code-modal-btn">Копировать</button>
          </div>
          <p style="font-size: 13px; color: var(--color-text-muted); margin-top: 8px;">
            Поделитесь этим кодом с друзьями, чтобы они могли добавить вас
          </p>
        </div>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary" onclick="document.getElementById('modal-overlay').style.display='none'">Отмена</button>
        <button class="btn btn--primary" id="save-settings-btn">Сохранить</button>
      </div>
    `;

    modalOverlay.style.display = 'flex';

    document.getElementById('copy-code-modal-btn').onclick = async () => {
      const success = await copyToClipboard(this.userCode);
      if (success) {
        showToast('Код скопирован!', 'success', 2000);
      }
    };

    document.getElementById('save-settings-btn').onclick = () => {
      const newNickname = document.getElementById('nickname-input').value.trim();
      if (this.setUserNickname(newNickname)) {
        document.getElementById('modal-overlay').style.display = 'none';
      }
    };
  }

  async startCall(callType) {
    if (!this.currentDmUserId) {
      showToast('Выберите друга для звонка', 'info');
      return;
    }

    const friends = this.store.getState('friends') || [];
    const friend = friends.find(f => f.id === this.currentDmUserId);

    try {
      document.getElementById('call-modal').style.display = 'flex';
      document.getElementById('call-title').textContent = `${callType === 'video' ? 'Видеозвонок' : 'Звонок'} - ${friend?.username || 'пользователь'}`;
      document.getElementById('call-status').textContent = 'Получение доступа...';
      document.getElementById('call-status').style.display = 'block';

      const { localStream } = await this.webrtc.startCall(this.currentDmUserId, callType);
      
      const localVideo = document.getElementById('local-video');
      localVideo.srcObject = localStream;
      localVideo.style.display = callType === 'video' ? 'block' : 'none';

      document.getElementById('call-status').textContent = `Звоним ${friend?.username}...`;
    } catch (error) {
      showToast('Ошибка: ' + error.message, 'error');
      this.endCall();
    }
  }

  async answerCall(offer, callerId, callType) {
    try {
      document.getElementById('call-modal').style.display = 'flex';
      document.getElementById('call-title').textContent = `${callType === 'video' ? 'Видеозвонок' : 'Звонок'}`;
      document.getElementById('call-status').textContent = 'Подключение...';
      document.getElementById('call-status').style.display = 'block';

      const { localStream } = await this.webrtc.answerCall(offer, callerId, callType);

      const localVideo = document.getElementById('local-video');
      localVideo.srcObject = localStream;
      localVideo.style.display = callType === 'video' ? 'block' : 'none';
    } catch (error) {
      showToast('Ошибка: ' + error.message, 'error');
      this.endCall();
    }
  }

  endCall() {
    document.getElementById('call-modal').style.display = 'none';
    
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    
    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach(track => track.stop());
      localVideo.srcObject = null;
    }
    
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject = null;
    }
  }

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.textContent.trim();

    if (!content) return;

    const channelId = this.currentDmUserId ? `dm-${this.currentDmUserId}` : 'global';

    this.ws.send('MESSAGE_CREATE', {
      channelId,
      content
    });

    input.textContent = '';
  }

  showHomeView() {
    this.currentDmUserId = null;
    
    document.getElementById('friends-sidebar').style.display = 'flex';
    document.getElementById('channel-list').style.display = 'none';
    document.getElementById('friends-main').style.display = 'flex';
    document.getElementById('chat-header').style.display = 'none';
    document.getElementById('messages-container').style.display = 'none';
    document.querySelector('.message-composer').style.display = 'none';
    document.getElementById('members-sidebar').style.display = 'none';

    this.renderFriends();
  }

  showDMView(userId) {
    this.currentDmUserId = userId;

    document.getElementById('friends-sidebar').style.display = 'flex';
    document.getElementById('friends-main').style.display = 'none';
    document.getElementById('chat-header').style.display = 'flex';
    document.getElementById('messages-container').style.display = 'block';
    document.querySelector('.message-composer').style.display = 'block';
    document.getElementById('members-sidebar').style.display = 'none';

    const friends = this.store.getState('friends') || [];
    const friend = friends.find(f => f.id === userId);
    if (friend) {
      document.getElementById('channel-name').textContent = friend.username;
    }

    this.renderMessages();
  }

  renderFriends() {
    const container = document.getElementById('friends-content');
    const friends = this.store.getState('friends') || [];

    container.innerHTML = '';

    if (friends.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--color-text-muted);">
          <p style="margin-bottom: 16px;">У вас пока нет друзей</p>
          <button class="btn btn--primary" onclick="document.getElementById('add-friend-btn').click()">
            <svg width="20" height="20"><use href="icons.svg#user-plus"></use></svg>
            Добавить друга
          </button>
        </div>
      `;
      return;
    }

    friends.forEach(friend => {
      const card = this.createFriendCard(friend);
      container.appendChild(card);
    });

    // Render DMs
    const dmList = document.getElementById('dm-list');
    while (dmList.children.length > 1) {
      dmList.removeChild(dmList.lastChild);
    }

    friends.forEach(friend => {
      const dmItem = this.createDMItem(friend);
      dmList.appendChild(dmItem);
    });
  }

  createFriendCard(friend) {
    const card = document.createElement('div');
    card.className = 'friend-card';

    card.innerHTML = `
      <div class="friend-card__avatar" style="background: ${stringToColor(friend.username)}">${getInitials(friend.username)}</div>
      <div class="friend-card__info">
        <div class="friend-card__name">${friend.username}</div>
        <div class="friend-card__status-text">${friend.status === 'online' ? 'В сети' : 'Не в сети'}</div>
      </div>
      <div class="friend-card__actions">
        <button class="friend-card__btn" title="Сообщение" data-action="message" data-user-id="${friend.id}">
          <svg width="20" height="20"><use href="icons.svg#message-circle"></use></svg>
        </button>
        <button class="friend-card__btn" title="Позвонить" data-action="call" data-user-id="${friend.id}">
          <svg width="20" height="20"><use href="icons.svg#volume"></use></svg>
        </button>
        <button class="friend-card__btn" title="Видеозвонок" data-action="video" data-user-id="${friend.id}">
          <svg width="20" height="20"><use href="icons.svg#video"></use></svg>
        </button>
      </div>
    `;

    card.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        const userId = e.currentTarget.dataset.userId;

        if (action === 'message') {
          this.showDMView(userId);
        } else if (action === 'call') {
          this.currentDmUserId = userId;
          this.startCall('audio');
        } else if (action === 'video') {
          this.currentDmUserId = userId;
          this.startCall('video');
        }
      });
    });

    return card;
  }

  createDMItem(friend) {
    const item = document.createElement('div');
    item.className = 'dm-item';

    item.innerHTML = `
      <div class="dm-item__avatar" style="background: ${stringToColor(friend.username)}">${getInitials(friend.username)}</div>
      <div class="dm-item__content">
        <div class="dm-item__name">${friend.username}</div>
      </div>
    `;

    item.addEventListener('click', () => this.showDMView(friend.id));

    return item;
  }

  renderMessages() {
    const container = document.getElementById('messages-list');
    const messages = this.store.getState('messages') || [];
    const channelId = this.currentDmUserId ? `dm-${this.currentDmUserId}` : 'global';

    const channelMessages = messages.filter(m => m.channel_id === channelId);

    container.innerHTML = '';

    if (channelMessages.length === 0) {
      container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-text-muted);">Начните общение!</div>';
      return;
    }

    channelMessages.forEach(message => {
      const messageEl = this.createMessageElement(message);
      container.appendChild(messageEl);
    });

    setTimeout(() => {
      const scrollContainer = document.getElementById('messages-scroll');
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }, 0);
  }

  createMessageElement(message) {
    const friends = this.store.getState('friends') || [];
    const author = friends.find(f => f.id === message.author_id) || this.currentUser;

    const messageEl = document.createElement('div');
    messageEl.className = 'message';

    messageEl.innerHTML = `
      <div class="message__avatar" style="background: ${stringToColor(author.username)}">${getInitials(author.username)}</div>
      <div class="message__content-wrapper">
        <div class="message__header">
          <span class="message__author">${author.username}</span>
          <span class="message__timestamp">${new Date(message.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="message__text">${message.content}</div>
      </div>
    `;

    return messageEl;
  }

  updateUserPanel() {
    const userName = document.getElementById('user-name');
    const userCodeValue = document.getElementById('user-code-value');
    const avatar = document.getElementById('user-avatar');
    
    if (userName) userName.textContent = this.currentUser.username;
    if (userCodeValue) userCodeValue.textContent = this.userCode;
    if (avatar) {
      avatar.style.background = stringToColor(this.currentUser.username);
      avatar.textContent = getInitials(this.currentUser.username);
    }
  }

  async loadSvgSprite() {
    try {
      const response = await fetch('icons.svg');
      const svg = await response.text();
      const container = document.getElementById('svg-sprite-container');
      if (container) {
        container.innerHTML = svg;
      }
    } catch (error) {
      console.error('Failed to load SVG sprite:', error);
    }
  }
}

// Wait for DOM to be ready
console.log('Document ready state:', document.readyState);

if (document.readyState === 'loading') {
  console.log('Waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired, creating app...');
    const app = new App();
    app.init();
  });
} else {
  console.log('DOM already loaded, creating app...');
  const app = new App();
  app.init();
}
