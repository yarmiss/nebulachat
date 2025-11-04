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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initializeUser();
    initializeEventListeners();
    initializeWebRTC();
    loadMessages();
    
    // Периодически обновляем список пользователей
    setInterval(updateUsers, 2000);
});

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

// Инициализация WebRTC
function initializeWebRTC() {
    // Используем простую реализацию через localStorage для синхронизации
    // В реальном приложении здесь был бы WebSocket сервер
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
    
    // Синхронизация с другими пользователями через localStorage
    const syncKey = `sync_${currentChannel}_${Date.now()}`;
    localStorage.setItem(syncKey, JSON.stringify(message));
    
    // Удаляем старые ключи синхронизации
    setTimeout(() => {
        localStorage.removeItem(syncKey);
    }, 5000);
    
    input.value = '';
    renderMessages();
    
    // Отправляем через data channels если они открыты
    dataChannels.forEach(channel => {
        if (channel.readyState === 'open') {
            channel.send(JSON.stringify({ type: 'message', data: message }));
        }
    });
}

// Проверка новых сообщений
function checkForNewMessages() {
    // Проверяем localStorage на новые сообщения
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

// Управление пользователями
function updateUsers() {
    // Синхронизация пользователей через localStorage
    const userKey = `user_${currentUser.id}`;
    localStorage.setItem(userKey, JSON.stringify({
        ...currentUser,
        lastSeen: Date.now()
    }));
    
    // Находим других активных пользователей
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('user_') && key !== userKey) {
            try {
                const userData = JSON.parse(localStorage.getItem(key));
                const lastSeen = Date.now() - (userData.lastSeen || 0);
                if (lastSeen < 10000) { // Активен в последние 10 секунд
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
        
        // Создаем подключения к другим пользователям
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
    
    // Добавляем локальный поток
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
    
    // Обработка входящего потока
    pc.ontrack = (event) => {
        const stream = event.streams[0];
        remoteStreams.set(userId, stream);
        const user = users.get(userId);
        addRemoteVideo(stream, user ? user.name : 'Неизвестный');
    };
    
    // Создаем data channel для сообщений
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
    
    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // В реальном приложении здесь была бы отправка через signaling сервер
            console.log('ICE candidate:', event.candidate);
        }
    };
    
    // Создаем offer
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            console.log('Offer создан для', userId);
            // В реальном приложении здесь была бы отправка offer через signaling сервер
        })
        .catch(error => {
            console.error('Ошибка создания offer:', error);
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

function addLocalVideo(stream, name) {
    const videosContainer = document.getElementById('callVideos');
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video_${currentUser.id}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true; // Локальное видео всегда без звука
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `${name} (Вы)`;
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    videosContainer.appendChild(videoContainer);
}

function addRemoteVideo(stream, name) {
    const videosContainer = document.getElementById('callVideos');
    
    // Удаляем старое видео если есть
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
    // Останавливаем локальный поток
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Закрываем все peer connections
    peerConnections.forEach(pc => {
        pc.close();
    });
    peerConnections.clear();
    
    // Закрываем data channels
    dataChannels.forEach(channel => {
        channel.close();
    });
    dataChannels.clear();
    
    // Останавливаем удаленные потоки
    remoteStreams.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
    });
    remoteStreams.clear();
    
    // Очищаем видео контейнер
    document.getElementById('callVideos').innerHTML = '';
    
    hideCallModal();
    isCallActive = false;
    isScreenSharing = false;
}

async function toggleScreenShare() {
    if (isScreenSharing) {
        // Переключаемся обратно на камеру
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
        // Начинаем демонстрацию экрана
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            // Добавляем аудио из микрофона
            if (localStream) {
                localStream.getAudioTracks().forEach(track => {
                    screenStream.addTrack(track);
                });
            }
            
            replaceLocalStream(screenStream);
            isScreenSharing = true;
            
            // Обработка остановки демонстрации экрана
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
    
    // Обновляем видео элемент
    const videoContainer = document.getElementById(`video_${currentUser.id}`);
    if (videoContainer) {
        const video = videoContainer.querySelector('video');
        if (video) {
            video.srcObject = newStream;
        }
    }
    
    // Обновляем треки во всех peer connections
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
