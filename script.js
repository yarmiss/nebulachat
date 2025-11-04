// Глобальные переменные
let localStream = null;
let remoteStreams = new Map();
let peerConnections = new Map();
let dataChannels = new Map();
let isCallActive = false;
let isMuted = false;
let isVideoEnabled = true;
let isScreenSharing = false;
let currentChannel = 'general';
let messages = {};
let users = new Map();
let currentUser = null;
let ws = null;
let wsReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initializeUser();
    initializeWebSocket();
    initializeEventListeners();
    loadMessages();
    
    // Периодически обновляем список пользователей
    setInterval(updateUsers, 2000);
});

// Инициализация WebSocket
function initializeWebSocket() {
    // Используем WebSocket сервер
    // В продакшене замените на URL вашего Cloudflare Worker
    const wsUrl = getWebSocketUrl();
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('WebSocket подключен');
            wsReconnectAttempts = 0;
            
            // Отправляем информацию о пользователе
            if (currentUser) {
                ws.send(JSON.stringify({
                    type: 'user_update',
                    data: {
                        ...currentUser,
                        lastSeen: Date.now()
                    }
                }));
            }
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'new_message') {
                    handleRemoteMessage(data.data);
                } else if (data.type === 'user_update') {
                    handleUserUpdate(data.data);
                } else if (data.type === 'history') {
                    handleMessageHistory(data.messages);
                }
            } catch (e) {
                console.error('Ошибка обработки WebSocket сообщения:', e);
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket ошибка:', error);
        };
        
        ws.onclose = () => {
            console.log('WebSocket отключен');
            // Попытка переподключения
            if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                wsReconnectAttempts++;
                setTimeout(() => {
                    console.log(`Попытка переподключения ${wsReconnectAttempts}...`);
                    initializeWebSocket();
                }, 2000 * wsReconnectAttempts);
            }
        };
    } catch (e) {
        console.error('Ошибка создания WebSocket:', e);
        // Fallback на localStorage если WebSocket недоступен
        initializeWebRTC();
    }
}

function getWebSocketUrl() {
    // Определяем URL WebSocket сервера
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    // Для локальной разработки используем локальный сервер
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        return `ws://localhost:8080?room=${currentChannel}`;
    } else {
        // В продакшене используем Cloudflare Worker
        const workerUrl = 'wss://discord-websocket.ptitsyn-oleshka.workers.dev';
        return `${workerUrl}?room=${currentChannel}`;
    }
}

function handleMessageHistory(historyMessages) {
    if (!historyMessages || historyMessages.length === 0) return;
    
    historyMessages.forEach(msg => {
        if (!messages[msg.channel]) {
            messages[msg.channel] = [];
        }
        if (!messages[msg.channel].find(m => m.id === msg.id)) {
            messages[msg.channel].push(msg);
        }
    });
    
    // Сохраняем в localStorage для офлайн режима
    Object.keys(messages).forEach(channel => {
        localStorage.setItem(`messages_${channel}`, JSON.stringify(messages[channel]));
    });
    
    if (messages[currentChannel]) {
        renderMessages();
    }
}

function handleUserUpdate(userData) {
    if (userData.id === currentUser.id) return;
    
    users.set(userData.id, userData);
    addUserToList(userData);
    document.getElementById('membersCount').textContent = users.size;
}

// Инициализация пользователя
function initializeUser() {
    const storedUser = localStorage.getItem('discordUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
    } else {
        currentUser = {
            id: generateId(),
            name: `Пользователь ${Math.floor(Math.random() * 1000)}`,
            avatar: generateAvatar()
        };
        localStorage.setItem('discordUser', JSON.stringify(currentUser));
    }
    
    users.set(currentUser.id, currentUser);
    updateUserUI();
    addUserToList(currentUser);
}

function generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function generateAvatar() {
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#4facfe',
        '#43e97b', '#fa709a', '#fee140', '#30cfd0'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function updateUserUI() {
    document.getElementById('username').textContent = currentUser.name;
    document.getElementById('userInitials').textContent = currentUser.name.charAt(0).toUpperCase();
    const avatar = document.getElementById('userAvatar');
    avatar.style.background = `linear-gradient(135deg, ${currentUser.avatar} 0%, ${currentUser.avatar}dd 100%)`;
}

// Инициализация обработчиков событий
function initializeEventListeners() {
    // Переключение каналов
    document.querySelectorAll('.channel-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentChannel = item.dataset.channel;
            document.querySelector('.channel-title').textContent = item.querySelector('span:last-child').textContent;
            
            // Переподключаемся к WebSocket с новой комнатой
            if (ws) {
                ws.close();
            }
            initializeWebSocket();
            loadMessages();
        });
    });

    // Отправка сообщения
    const messageInput = document.getElementById('messageInput');
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Кнопки звонка
    document.getElementById('callBtn').addEventListener('click', startCall);
    document.getElementById('videoBtn').addEventListener('click', startVideoCall);
    document.getElementById('screenShareBtn').addEventListener('click', toggleScreenShare);
    
    // Кнопки в модальном окне
    document.getElementById('closeCallBtn').addEventListener('click', endCall);
    document.getElementById('hangupBtn').addEventListener('click', endCall);
    document.getElementById('callMicBtn').addEventListener('click', toggleMute);
    document.getElementById('callVideoBtn').addEventListener('click', toggleVideo);
    document.getElementById('callScreenShareBtn').addEventListener('click', toggleScreenShare);

    // Кнопки управления
    document.getElementById('micBtn').addEventListener('click', () => {
        isMuted = !isMuted;
        updateMicButton();
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
        }
    });

    // Кнопка участников
    document.getElementById('membersBtn').addEventListener('click', () => {
        const sidebar = document.getElementById('membersSidebar');
        sidebar.classList.toggle('active');
    });

    document.getElementById('closeMembersBtn').addEventListener('click', () => {
        document.getElementById('membersSidebar').classList.remove('active');
    });
}

// Инициализация WebRTC (fallback если WebSocket недоступен)
function initializeWebRTC() {
    setInterval(checkForNewMessages, 1000);
}

// Загрузка сообщений
function loadMessages() {
    const stored = localStorage.getItem(`messages_${currentChannel}`);
    if (stored) {
        messages[currentChannel] = JSON.parse(stored);
    } else {
        messages[currentChannel] = [];
    }
    
    renderMessages();
}

function renderMessages() {
    const container = document.getElementById('messagesList');
    container.innerHTML = '';
    
    if (!messages[currentChannel] || messages[currentChannel].length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--discord-text-muted); padding: 32px;">Здесь пока нет сообщений</div>';
        return;
    }
    
    messages[currentChannel].forEach(msg => {
        const messageEl = createMessageElement(msg);
        container.appendChild(messageEl);
    });
    
    container.scrollTop = container.scrollHeight;
}

function createMessageElement(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const user = users.get(msg.userId) || { name: 'Неизвестный', avatar: '#667eea' };
    const initials = user.name.charAt(0).toUpperCase();
    
    messageDiv.innerHTML = `
        <div class="message-avatar" style="background: linear-gradient(135deg, ${user.avatar} 0%, ${user.avatar}dd 100%);">
            ${initials}
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-author">${escapeHtml(user.name)}</span>
                <span class="message-timestamp">${formatTime(msg.timestamp)}</span>
            </div>
            <div class="message-text">${escapeHtml(msg.text)}</div>
        </div>
    `;
    
    return messageDiv;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    
    return date.toLocaleDateString('ru-RU', { 
        day: 'numeric', 
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Отправка сообщения
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const message = {
        id: generateId(),
        userId: currentUser.id,
        text: text,
        timestamp: Date.now(),
        channel: currentChannel
    };
    
    if (!messages[currentChannel]) {
        messages[currentChannel] = [];
    }
    
    messages[currentChannel].push(message);
    localStorage.setItem(`messages_${currentChannel}`, JSON.stringify(messages[currentChannel]));
    
    // Отправляем через WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'message',
            ...message
        }));
    } else {
        // Fallback на localStorage если WebSocket недоступен
        const syncKey = `sync_${currentChannel}_${Date.now()}`;
        localStorage.setItem(syncKey, JSON.stringify(message));
        setTimeout(() => {
            localStorage.removeItem(syncKey);
        }, 5000);
    }
    
    input.value = '';
    renderMessages();
    
    // Отправляем через data channels если они открыты
    dataChannels.forEach(channel => {
        if (channel.readyState === 'open') {
            channel.send(JSON.stringify({ type: 'message', data: message }));
        }
    });
}

// Проверка новых сообщений (fallback)
function checkForNewMessages() {
    if (ws && ws.readyState === WebSocket.OPEN) return; // Используем WebSocket
    
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('sync_')) {
            try {
                const message = JSON.parse(localStorage.getItem(key));
                if (message.channel === currentChannel && message.userId !== currentUser.id) {
                    if (!messages[currentChannel]) {
                        messages[currentChannel] = [];
                    }
                    if (!messages[currentChannel].find(m => m.id === message.id)) {
                        messages[currentChannel].push(message);
                        localStorage.setItem(`messages_${currentChannel}`, JSON.stringify(messages[currentChannel]));
                        renderMessages();
                    }
                }
            } catch (e) {
                // Игнорируем ошибки
            }
        }
    });
}

function handleRemoteMessage(message) {
    if (!messages[message.channel]) {
        messages[message.channel] = [];
    }
    
    if (!messages[message.channel].find(m => m.id === message.id)) {
        messages[message.channel].push(message);
        localStorage.setItem(`messages_${message.channel}`, JSON.stringify(messages[message.channel]));
        
        if (message.channel === currentChannel) {
            renderMessages();
        }
    }
}

// Управление пользователями
function updateUsers() {
    // Отправляем обновление через WebSocket
    if (ws && ws.readyState === WebSocket.OPEN && currentUser) {
        ws.send(JSON.stringify({
            type: 'user_update',
            data: {
                ...currentUser,
                lastSeen: Date.now()
            }
        }));
    } else {
        // Fallback на localStorage
        const userKey = `user_${currentUser.id}`;
        localStorage.setItem(userKey, JSON.stringify({
            ...currentUser,
            lastSeen: Date.now()
        }));
        
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('user_') && key !== userKey) {
                try {
                    const userData = JSON.parse(localStorage.getItem(key));
                    const lastSeen = Date.now() - (userData.lastSeen || 0);
                    if (lastSeen < 10000) {
                        if (!users.has(userData.id)) {
                            users.set(userData.id, userData);
                            addUserToList(userData);
                        }
                    } else {
                        users.delete(userData.id);
                        removeUserFromList(userData.id);
                    }
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
        });
    }
    
    document.getElementById('membersCount').textContent = users.size;
}

function addUserToList(user) {
    const list = document.getElementById('membersList');
    if (document.getElementById(`member_${user.id}`)) return;
    
    const memberDiv = document.createElement('div');
    memberDiv.className = 'member-item';
    memberDiv.id = `member_${user.id}`;
    
    const initials = user.name.charAt(0).toUpperCase();
    const isOnline = user.id === currentUser.id || (Date.now() - (user.lastSeen || 0) < 10000);
    
    memberDiv.innerHTML = `
        <div class="member-avatar" style="background: linear-gradient(135deg, ${user.avatar} 0%, ${user.avatar}dd 100%);">
            ${initials}
            <div class="member-status" style="background-color: ${isOnline ? 'var(--discord-green)' : 'var(--discord-text-muted)'};"></div>
        </div>
        <div class="member-name">${escapeHtml(user.name)}</div>
    `;
    
    list.appendChild(memberDiv);
}

function removeUserFromList(userId) {
    const member = document.getElementById(`member_${userId}`);
    if (member) {
        member.remove();
    }
}

// Звонки через WebRTC
async function startCall() {
    if (isCallActive) {
        endCall();
        return;
    }
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
        });
        
        showCallModal();
        addLocalVideo(localStream, currentUser.name);
        isCallActive = true;
        
        users.forEach((user, userId) => {
            if (userId !== currentUser.id) {
                createPeerConnection(userId);
            }
        });
        
    } catch (error) {
        console.error('Ошибка доступа к микрофону:', error);
        alert('Не удалось получить доступ к микрофону');
    }
}

async function startVideoCall() {
    if (isCallActive) {
        endCall();
        return;
    }
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: true 
        });
        
        showCallModal();
        addLocalVideo(localStream, currentUser.name);
        isCallActive = true;
        isVideoEnabled = true;
        
        users.forEach((user, userId) => {
            if (userId !== currentUser.id) {
                createPeerConnection(userId);
            }
        });
        
    } catch (error) {
        console.error('Ошибка доступа к камере:', error);
        alert('Не удалось получить доступ к камере');
    }
}

function createPeerConnection(userId) {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    const pc = new RTCPeerConnection(configuration);
    peerConnections.set(userId, pc);
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
    
    pc.ontrack = (event) => {
        const stream = event.streams[0];
        remoteStreams.set(userId, stream);
        const user = users.get(userId);
        addRemoteVideo(stream, user ? user.name : 'Неизвестный');
    };
    
    const dataChannel = pc.createDataChannel('messages');
    dataChannels.set(userId, dataChannel);
    
    dataChannel.onopen = () => {
        console.log('Data channel открыт для', userId);
    };
    
    dataChannel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'message') {
                handleRemoteMessage(data.data);
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('ICE candidate:', event.candidate);
        }
    };
    
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            console.log('Offer создан для', userId);
        })
        .catch(error => {
            console.error('Ошибка создания offer:', error);
        });
}

function addLocalVideo(stream, name) {
    const videosContainer = document.getElementById('callVideos');
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video_${currentUser.id}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `${name} (Вы)`;
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    videosContainer.appendChild(videoContainer);
}

function addRemoteVideo(stream, name) {
    const videosContainer = document.getElementById('callVideos');
    
    const existing = document.getElementById(`video_remote_${name}`);
    if (existing) {
        existing.remove();
    }
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video_remote_${name}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = name;
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    videosContainer.appendChild(videoContainer);
}

function showCallModal() {
    document.getElementById('callModal').classList.add('active');
}

function hideCallModal() {
    document.getElementById('callModal').classList.remove('active');
}

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    peerConnections.forEach(pc => {
        pc.close();
    });
    peerConnections.clear();
    
    dataChannels.forEach(channel => {
        channel.close();
    });
    dataChannels.clear();
    
    remoteStreams.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
    });
    remoteStreams.clear();
    
    document.getElementById('callVideos').innerHTML = '';
    
    hideCallModal();
    isCallActive = false;
    isScreenSharing = false;
}

async function toggleScreenShare() {
    if (isScreenSharing) {
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
            
            replaceLocalStream(newStream);
            isScreenSharing = false;
        } catch (error) {
            console.error('Ошибка доступа к камере:', error);
        }
    } else {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            if (localStream) {
                localStream.getAudioTracks().forEach(track => {
                    screenStream.addTrack(track);
                });
            }
            
            replaceLocalStream(screenStream);
            isScreenSharing = true;
            
            screenStream.getVideoTracks()[0].onended = () => {
                toggleScreenShare();
            };
        } catch (error) {
            console.error('Ошибка демонстрации экрана:', error);
        }
    }
}

function replaceLocalStream(newStream) {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    localStream = newStream;
    
    const videoContainer = document.getElementById(`video_${currentUser.id}`);
    if (videoContainer) {
        const video = videoContainer.querySelector('video');
        if (video) {
            video.srcObject = newStream;
        }
    }
    
    peerConnections.forEach((pc, userId) => {
        const sender = pc.getSenders().find(s => 
            s.track && s.track.kind === 'video'
        );
        
        if (sender) {
            sender.replaceTrack(newStream.getVideoTracks()[0]);
        } else {
            newStream.getTracks().forEach(track => {
                pc.addTrack(track, newStream);
            });
        }
    });
}

function toggleMute() {
    isMuted = !isMuted;
    
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }
    
    updateMicButton();
    document.getElementById('callMicBtn').classList.toggle('mute', isMuted);
}

function toggleVideo() {
    isVideoEnabled = !isVideoEnabled;
    
    if (localStream) {
        localStream.getVideoTracks().forEach(track => {
            track.enabled = isVideoEnabled;
        });
    }
    
    document.getElementById('callVideoBtn').classList.toggle('video-off', !isVideoEnabled);
}

function updateMicButton() {
    const btn = document.getElementById('micBtn');
    if (isMuted) {
        btn.classList.add('muted');
        btn.classList.remove('active');
    } else {
        btn.classList.remove('muted');
        btn.classList.add('active');
    }
}
