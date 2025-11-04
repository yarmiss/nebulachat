// ===== WebRTC переменные =====
let peerConnections = new Map(); // userId -> RTCPeerConnection
let localStream = null;
let remoteStreams = new Map(); // userId -> MediaStream
let isMicrophoneMuted = false;
let isSpeakerMuted = false;
let currentVoiceChannel = null;

// ===== STUN/TURN серверы =====
const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
    // Для production добавьте TURN сервер
    // {
    //   urls: 'turn:your-turn-server.com',
    //   username: 'username',
    //   credential: 'password'
    // }
  ]
};

// ===== Инициализация WebRTC =====
function initWebRTC(socket) {
  if (!socket) return;
  
  // Обработка WebRTC событий от сервера
  socket.on('voice-offer', async ({ fromUserId, offer, channelId }) => {
    await handleVoiceOffer(fromUserId, offer, channelId);
  });
  
  socket.on('voice-answer', async ({ fromUserId, answer }) => {
    await handleVoiceAnswer(fromUserId, answer);
  });
  
  socket.on('ice-candidate', async ({ fromUserId, candidate }) => {
    await handleIceCandidate(fromUserId, candidate);
  });
  
  socket.on('video-offer', async ({ fromUserId, offer }) => {
    await handleVideoOffer(fromUserId, offer);
  });
  
  // Установка обработчиков кнопок
  setupWebRTCControls();
}

// ===== Настройка элементов управления =====
function setupWebRTCControls() {
  const micBtn = document.getElementById('mic-btn');
  const headphoneBtn = document.getElementById('headphone-btn');
  
  if (micBtn) {
    micBtn.addEventListener('click', toggleMicrophone);
  }
  
  if (headphoneBtn) {
    headphoneBtn.addEventListener('click', toggleSpeaker);
  }
}

// ===== Подключение к голосовому каналу =====
async function joinVoiceChannel(channel) {
  if (currentVoiceChannel && currentVoiceChannel.id === channel.id) {
    // Уже подключены к этому каналу
    return;
  }
  
  // Отключение от предыдущего канала
  if (currentVoiceChannel) {
    await leaveVoiceChannel();
  }
  
  currentVoiceChannel = channel;
  
  try {
    // Получение локального медиа потока
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    
    // Отображение локального аудио (для визуализации)
    updateMicrophoneUI(true);
    
    // Уведомление других пользователей (через Socket.IO)
    if (socket) {
      socket.emit('join-voice-channel', { channelId: channel.id });
    }
    
    console.log('Подключено к голосовому каналу');
  } catch (error) {
    console.error('Ошибка получения доступа к микрофону:', error);
    alert('Не удалось получить доступ к микрофону');
  }
}

// ===== Покидание голосового канала =====
async function leaveVoiceChannel() {
  // Закрытие всех peer connections
  for (const [userId, peerConnection] of peerConnections.entries()) {
    peerConnection.close();
    peerConnections.delete(userId);
  }
  
  // Остановка локального потока
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Очистка удаленных потоков
  remoteStreams.clear();
  
  // Уведомление сервера
  if (socket && currentVoiceChannel) {
    socket.emit('leave-voice-channel', { channelId: currentVoiceChannel.id });
  }
  
  currentVoiceChannel = null;
  updateMicrophoneUI(false);
  
  console.log('Отключено от голосового канала');
}

// ===== Создание peer connection =====
async function createPeerConnection(userId) {
  const peerConnection = new RTCPeerConnection(rtcConfiguration);
  
  // Добавление локальных треков
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }
  
  // Обработка удаленных треков
  peerConnection.ontrack = (event) => {
    const remoteStream = event.streams[0];
    remoteStreams.set(userId, remoteStream);
    playRemoteAudio(remoteStream, userId);
  };
  
  // Обработка ICE кандидатов
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('ice-candidate', {
        targetUserId: userId,
        candidate: event.candidate
      });
    }
  };
  
  // Обработка изменения состояния соединения
  peerConnection.onconnectionstatechange = () => {
    console.log(`Peer connection состояние для ${userId}:`, peerConnection.connectionState);
    
    if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
      peerConnection.close();
      peerConnections.delete(userId);
      remoteStreams.delete(userId);
    }
  };
  
  peerConnections.set(userId, peerConnection);
  return peerConnection;
}

// ===== Обработка voice offer =====
async function handleVoiceOffer(fromUserId, offer, channelId) {
  try {
    let peerConnection = peerConnections.get(fromUserId);
    
    if (!peerConnection) {
      peerConnection = await createPeerConnection(fromUserId);
    }
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Создание answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    // Отправка answer
    if (socket) {
      socket.emit('voice-answer', {
        targetUserId: fromUserId,
        answer: answer
      });
    }
  } catch (error) {
    console.error('Ошибка обработки voice offer:', error);
  }
}

// ===== Обработка voice answer =====
async function handleVoiceAnswer(fromUserId, answer) {
  try {
    const peerConnection = peerConnections.get(fromUserId);
    
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  } catch (error) {
    console.error('Ошибка обработки voice answer:', error);
  }
}

// ===== Обработка ICE candidate =====
async function handleIceCandidate(fromUserId, candidate) {
  try {
    const peerConnection = peerConnections.get(fromUserId);
    
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('Ошибка обработки ICE candidate:', error);
  }
}

// ===== Обработка video offer =====
async function handleVideoOffer(fromUserId, offer) {
  // Аналогично voice offer, но с видео
  try {
    let peerConnection = peerConnections.get(fromUserId);
    
    if (!peerConnection) {
      // Для видео нужно получить видеопоток
      if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });
      }
      peerConnection = await createPeerConnection(fromUserId);
    }
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    if (socket) {
      socket.emit('video-answer', {
        targetUserId: fromUserId,
        answer: answer
      });
    }
  } catch (error) {
    console.error('Ошибка обработки video offer:', error);
  }
}

// ===== Инициация соединения =====
async function initiateConnection(targetUserId) {
  try {
    let peerConnection = peerConnections.get(targetUserId);
    
    if (!peerConnection) {
      peerConnection = await createPeerConnection(targetUserId);
    }
    
    // Создание offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    // Отправка offer
    if (socket && currentVoiceChannel) {
      socket.emit('voice-offer', {
        targetUserId: targetUserId,
        offer: offer,
        channelId: currentVoiceChannel.id
      });
    }
  } catch (error) {
    console.error('Ошибка инициации соединения:', error);
  }
}

// ===== Воспроизведение удаленного аудио =====
function playRemoteAudio(stream, userId) {
  // Создание аудио элемента для воспроизведения
  const audio = new Audio();
  audio.srcObject = stream;
  audio.autoplay = true;
  audio.volume = isSpeakerMuted ? 0 : 1;
  
  // Сохранение ссылки для управления громкостью
  if (!remoteAudios) {
    remoteAudios = new Map();
  }
  remoteAudios.set(userId, audio);
}

let remoteAudios = new Map();

// ===== Переключение микрофона =====
function toggleMicrophone() {
  if (!localStream) return;
  
  isMicrophoneMuted = !isMicrophoneMuted;
  
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMicrophoneMuted;
  });
  
  updateMicrophoneUI(!isMicrophoneMuted);
}

// ===== Переключение динамика =====
function toggleSpeaker() {
  isSpeakerMuted = !isSpeakerMuted;
  
  // Управление громкостью всех удаленных аудио потоков
  for (const [userId, audio] of remoteAudios.entries()) {
    audio.volume = isSpeakerMuted ? 0 : 1;
  }
  
  updateSpeakerUI(!isSpeakerMuted);
}

// ===== Обновление UI микрофона =====
function updateMicrophoneUI(isEnabled) {
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    if (isEnabled) {
      micBtn.classList.remove('muted');
    } else {
      micBtn.classList.add('muted');
    }
  }
}

// ===== Обновление UI динамика =====
function updateSpeakerUI(isEnabled) {
  const headphoneBtn = document.getElementById('headphone-btn');
  if (headphoneBtn) {
    if (isEnabled) {
      headphoneBtn.classList.remove('muted');
    } else {
      headphoneBtn.classList.add('muted');
    }
  }
}

// ===== Screen Sharing =====
async function startScreenShare() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    
    // Замена видеотрека во всех peer connections
    for (const [userId, peerConnection] of peerConnections.entries()) {
      const sender = peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender) {
        await sender.replaceTrack(screenStream.getVideoTracks()[0]);
      }
    }
    
    // Обработка остановки sharing
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };
    
    return screenStream;
  } catch (error) {
    console.error('Ошибка screen sharing:', error);
    throw error;
  }
}

async function stopScreenShare() {
  // Восстановление обычного видеопотока
  if (localStream) {
    for (const [userId, peerConnection] of peerConnections.entries()) {
      const sender = peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender && localStream.getVideoTracks()[0]) {
        await sender.replaceTrack(localStream.getVideoTracks()[0]);
      }
    }
  }
}

// Экспорт функций для использования в других модулях
window.joinVoiceChannel = joinVoiceChannel;
window.leaveVoiceChannel = leaveVoiceChannel;
window.startScreenShare = startScreenShare;
window.stopScreenShare = stopScreenShare;

