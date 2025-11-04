/**
 * NebulaChat - Real-time Chat
 * Все пользователи автоматически видят друг друга
 */

console.log('Loading NebulaChat app.js...');

import { Router } from './js/core/router.js';
import { Store } from './js/core/store.js';
import { WebSocketClient } from './js/core/websocket.js';
import { WebRTCClient } from './js/core/webrtc.js';

import { showToast } from './js/ui/components.js';
import { stringToColor, getInitials } from './js/utils/helpers.js';

console.log('All imports loaded successfully');

const WS_URL = 'wss://nebulachat-backend.ptitsyn-oleshka.workers.dev/ws';

class App {
  constructor() {
    this.store = new Store();
    this.router = new Router();
    this.ws = null;
    this.webrtc = null;
    this.currentUser = null;
    this.userId = null;
    this.currentDmUserId = null;
  }

  async init() {
    console.log('Initializing NebulaChat...');

    try {
      await this.loadSvgSprite();
      console.log('SVG sprite loaded');
      
      // Получаем или создаем ID пользователя
      this.userId = this.getOrCreateUserId();
      console.log('User ID:', this.userId);
      
      // Устанавливаем никнейм
      const nickname = this.getUserNickname();
      console.log('Nickname:', nickname);
      
      this.currentUser = {
        id: this.userId,
        username: nickname,
        status: 'online'
      };

      this.store.setState('user', this.currentUser);
      this.store.setState('friends', []);
      this.store.setState('messages', []);

      // Показываем пользователя
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

  getOrCreateUserId() {
    let userId = localStorage.getItem('nebulachat_user_id');
    
    if (!userId) {
      // Генерируем уникальный ID
      userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('nebulachat_user_id', userId);
    }

    return userId;
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

      // Отправляем свой ID и никнейм
      this.ws.send('USER_REGISTER', {
        userId: this.userId,
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

    // Список всех пользователей (автоматически все в друзьях)
    this.ws.on('USERS_LIST', (payload) => {
      console.log('Users list:', payload);
      const users = (payload.users || []).filter(u => u.id !== this.userId);
      this.store.setState('friends', users);
      this.renderFriends();
    });

    // Новый пользователь подключился
    this.ws.on('USER_CONNECTED', (payload) => {
      console.log('User connected:', payload);
      const friends = this.store.getState('friends') || [];
      if (payload.user.id !== this.userId && !friends.find(f => f.id === payload.user.id)) {
        friends.push(payload.user);
        this.store.setState('friends', friends);
        this.renderFriends();
        showToast(`${payload.user.username} подключился`, 'info', 2000);
      }
    });

    // Пользователь отключился
    this.ws.on('USER_DISCONNECTED', (payload) => {
      console.log('User disconnected:', payload);
      const friends = this.store.getState('friends') || [];
      const friend = friends.find(f => f.id === payload.userId);
      if (friend) {
        friend.status = 'offline';
        this.store.setState('friends', friends);
        this.renderFriends();
      }
    });

    // Обновление статуса пользователя
    this.ws.on('USER_STATUS_UPDATE', (payload) => {
      const friends = this.store.getState('friends') || [];
      const friend = friends.find(f => f.id === payload.userId);
      if (friend) {
        friend.status = payload.status || 'online';
        this.store.setState('friends', friends);
        this.renderFriends();
      }
    });

    // Сообщения
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
      if (remoteVideo) {
        remoteVideo.srcObject = stream;
        document.getElementById('call-status').style.display = 'none';
      }
    });

    this.webrtc.on('connected', () => {
      const callStatus = document.getElementById('call-status');
      if (callStatus) {
        callStatus.textContent = 'Подключено';
        setTimeout(() => {
          callStatus.style.display = 'none';
        }, 2000);
      }
    });

    this.webrtc.on('callEnded', () => {
      this.endCall();
    });

    // Подключаемся
    this.ws.connect(this.userId);
  }

  setupEventListeners() {
    // Home button
    document.getElementById('home-btn')?.addEventListener('click', () => {
      this.showHomeView();
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
      if (this.webrtc) {
        const enabled = this.webrtc.toggleAudio();
        const btn = document.getElementById('toggle-mic-btn');
        if (btn) btn.classList.toggle('muted', !enabled);
      }
    });

    document.getElementById('toggle-video-btn')?.addEventListener('click', () => {
      if (this.webrtc) {
        const enabled = this.webrtc.toggleVideo();
        const btn = document.getElementById('toggle-video-btn');
        if (btn) btn.classList.toggle('muted', !enabled);
      }
    });

    document.getElementById('share-screen-btn')?.addEventListener('click', async () => {
      if (this.webrtc) {
        await this.webrtc.shareScreen();
      }
    });

    document.getElementById('end-call-btn')?.addEventListener('click', () => {
      if (this.webrtc) {
        this.webrtc.endCall();
      }
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
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary" onclick="document.getElementById('modal-overlay').style.display='none'">Отмена</button>
        <button class="btn btn--primary" id="save-settings-btn">Сохранить</button>
      </div>
    `;

    modalOverlay.style.display = 'flex';

    document.getElementById('save-settings-btn').onclick = () => {
      const newNickname = document.getElementById('nickname-input').value.trim();
      if (this.setUserNickname(newNickname)) {
        document.getElementById('modal-overlay').style.display = 'none';
      }
    };
  }

  async startCall(callType) {
    if (!this.currentDmUserId) {
      showToast('Выберите пользователя для звонка', 'info');
      return;
    }

    const friends = this.store.getState('friends') || [];
    const friend = friends.find(f => f.id === this.currentDmUserId);

    try {
      const callModal = document.getElementById('call-modal');
      if (callModal) callModal.style.display = 'flex';
      
      const callTitle = document.getElementById('call-title');
      if (callTitle) callTitle.textContent = `${callType === 'video' ? 'Видеозвонок' : 'Звонок'} - ${friend?.username || 'пользователь'}`;
      
      const callStatus = document.getElementById('call-status');
      if (callStatus) {
        callStatus.textContent = 'Получение доступа...';
        callStatus.style.display = 'block';
      }

      const { localStream } = await this.webrtc.startCall(this.currentDmUserId, callType);
      
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.style.display = callType === 'video' ? 'block' : 'none';
      }

      if (callStatus) callStatus.textContent = `Звоним ${friend?.username}...`;
    } catch (error) {
      showToast('Ошибка: ' + error.message, 'error');
      this.endCall();
    }
  }

  async answerCall(offer, callerId, callType) {
    try {
      const callModal = document.getElementById('call-modal');
      if (callModal) callModal.style.display = 'flex';
      
      const callTitle = document.getElementById('call-title');
      if (callTitle) callTitle.textContent = `${callType === 'video' ? 'Видеозвонок' : 'Звонок'}`;
      
      const callStatus = document.getElementById('call-status');
      if (callStatus) {
        callStatus.textContent = 'Подключение...';
        callStatus.style.display = 'block';
      }

      const { localStream } = await this.webrtc.answerCall(offer, callerId, callType);

      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.style.display = callType === 'video' ? 'block' : 'none';
      }
    } catch (error) {
      showToast('Ошибка: ' + error.message, 'error');
      this.endCall();
    }
  }

  endCall() {
    const callModal = document.getElementById('call-modal');
    if (callModal) callModal.style.display = 'none';
    
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    
    if (localVideo && localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach(track => track.stop());
      localVideo.srcObject = null;
    }
    
    if (remoteVideo && remoteVideo.srcObject) {
      remoteVideo.srcObject = null;
    }
  }

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input?.textContent?.trim();

    if (!content || !this.currentDmUserId) return;

    this.ws.send('MESSAGE_CREATE', {
      channelId: `dm-${this.currentDmUserId}`,
      content
    });

    if (input) input.textContent = '';
  }

  showHomeView() {
    this.currentDmUserId = null;
    
    const friendsSidebar = document.getElementById('friends-sidebar');
    const channelList = document.getElementById('channel-list');
    const friendsMain = document.getElementById('friends-main');
    const chatHeader = document.getElementById('chat-header');
    const messagesContainer = document.getElementById('messages-container');
    const messageComposer = document.querySelector('.message-composer');
    const membersSidebar = document.getElementById('members-sidebar');

    if (friendsSidebar) friendsSidebar.style.display = 'flex';
    if (channelList) channelList.style.display = 'none';
    if (friendsMain) friendsMain.style.display = 'flex';
    if (chatHeader) chatHeader.style.display = 'none';
    if (messagesContainer) messagesContainer.style.display = 'none';
    if (messageComposer) messageComposer.style.display = 'none';
    if (membersSidebar) membersSidebar.style.display = 'none';

    this.renderFriends();
  }

  showDMView(userId) {
    this.currentDmUserId = userId;

    const friendsSidebar = document.getElementById('friends-sidebar');
    const friendsMain = document.getElementById('friends-main');
    const chatHeader = document.getElementById('chat-header');
    const messagesContainer = document.getElementById('messages-container');
    const messageComposer = document.querySelector('.message-composer');
    const membersSidebar = document.getElementById('members-sidebar');

    if (friendsSidebar) friendsSidebar.style.display = 'flex';
    if (friendsMain) friendsMain.style.display = 'none';
    if (chatHeader) chatHeader.style.display = 'flex';
    if (messagesContainer) messagesContainer.style.display = 'block';
    if (messageComposer) messageComposer.style.display = 'block';
    if (membersSidebar) membersSidebar.style.display = 'none';

    const friends = this.store.getState('friends') || [];
    const friend = friends.find(f => f.id === userId);
    const channelName = document.getElementById('channel-name');
    if (channelName && friend) {
      channelName.textContent = friend.username;
    }

    this.renderMessages();
  }

  renderFriends() {
    const container = document.getElementById('friends-content');
    const friends = this.store.getState('friends') || [];

    if (!container) return;

    container.innerHTML = '';

    if (friends.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--color-text-muted);">
          <p style="margin-bottom: 16px;">Нет других пользователей онлайн</p>
          <p style="font-size: 14px;">Все кто подключится к сайту автоматически появятся здесь</p>
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
    if (dmList) {
      while (dmList.children.length > 1) {
        dmList.removeChild(dmList.lastChild);
      }

      friends.forEach(friend => {
        const dmItem = this.createDMItem(friend);
        dmList.appendChild(dmItem);
      });
    }
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

    if (!container) return;

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
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
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
    const userStatus = document.getElementById('user-status');
    const avatar = document.getElementById('user-avatar');
    
    if (userName) userName.textContent = this.currentUser.username;
    if (userStatus) userStatus.textContent = 'онлайн';
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
