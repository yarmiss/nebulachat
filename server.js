import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createTables } from './database.js';
import { authenticateSocket } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import serverRoutes from './routes/servers.js';
import channelRoutes from './routes/channels.js';
import messageRoutes from './routes/messages.js';
import friendRoutes from './routes/friends.js';
import directMessageRoutes from './routes/direct-messages.js';
import { dbGet, dbRun, dbAll } from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100 // максимум 100 запросов
});
app.use('/api/', limiter);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/direct-messages', directMessageRoutes);

// Socket.IO middleware
io.use(authenticateSocket);

// Socket.IO подключения
const activeUsers = new Map(); // userId -> socketId
const typingUsers = new Map(); // channelId -> Set(userId)

io.on('connection', (socket) => {
  console.log(`Пользователь подключен: ${socket.userId} (${socket.username})`);
  
  activeUsers.set(socket.userId, socket.id);

  // Обновление статуса на online
  dbRun('UPDATE users SET status = ? WHERE id = ?', ['online', socket.userId])
    .catch(err => console.error('Ошибка обновления статуса:', err));

  // Уведомление других пользователей
  socket.broadcast.emit('user-online', { userId: socket.userId });

  /**
   * Присоединение к каналу
   */
  socket.on('join-channel', async ({ channelId }) => {
    try {
      // Проверка доступа к каналу
      const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [channelId]);
      if (!channel) {
        socket.emit('error', { message: 'Канал не найден' });
        return;
      }

      const member = await dbGet(
        'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
        [channel.server_id, socket.userId]
      );

      if (!member) {
        socket.emit('error', { message: 'Нет доступа к каналу' });
        return;
      }

      socket.join(`channel:${channelId}`);
      socket.emit('channel-joined', { channelId });

      // Уведомление других пользователей
      socket.to(`channel:${channelId}`).emit('user-joined', {
        userId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Ошибка присоединения к каналу:', error);
      socket.emit('error', { message: 'Ошибка присоединения к каналу' });
    }
  });

  /**
   * Покидание канала
   */
  socket.on('leave-channel', ({ channelId }) => {
    socket.leave(`channel:${channelId}`);
    socket.to(`channel:${channelId}`).emit('user-left', {
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Отправка сообщения
   */
  socket.on('send-message', async ({ channelId, content, attachments }) => {
    try {
      // Проверка доступа
      const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [channelId]);
      if (!channel) {
        socket.emit('error', { message: 'Канал не найден' });
        return;
      }

      const member = await dbGet(
        'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
        [channel.server_id, socket.userId]
      );

      if (!member) {
        socket.emit('error', { message: 'Нет доступа к каналу' });
        return;
      }

      // Создание сообщения
      const result = await dbRun(
        'INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)',
        [channelId, socket.userId, content || null]
      );

      const messageId = result.lastID;

      // Получение полного сообщения
      const message = await dbGet(
        `SELECT m.*, u.username, u.avatar_url, u.status 
         FROM messages m 
         INNER JOIN users u ON m.user_id = u.id 
         WHERE m.id = ?`,
        [messageId]
      );

      // Отправка всем в канале
      io.to(`channel:${channelId}`).emit('new-message', message);

      // Остановка печати
      const typingSet = typingUsers.get(channelId);
      if (typingSet) {
        typingSet.delete(socket.userId);
        if (typingSet.size === 0) {
          typingUsers.delete(channelId);
        }
        socket.to(`channel:${channelId}`).emit('user-stop-typing', { userId: socket.userId });
      }
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });

  /**
   * Начало печати
   */
  socket.on('start-typing', ({ channelId }) => {
    if (!typingUsers.has(channelId)) {
      typingUsers.set(channelId, new Set());
    }
    typingUsers.get(channelId).add(socket.userId);
    
    socket.to(`channel:${channelId}`).emit('user-typing', {
      userId: socket.userId,
      username: socket.username
    });
  });

  /**
   * Остановка печати
   */
  socket.on('stop-typing', ({ channelId }) => {
    const typingSet = typingUsers.get(channelId);
    if (typingSet) {
      typingSet.delete(socket.userId);
      if (typingSet.size === 0) {
        typingUsers.delete(channelId);
      }
      socket.to(`channel:${channelId}`).emit('user-stop-typing', { userId: socket.userId });
    }
  });

  /**
   * Редактирование сообщения
   */
  socket.on('edit-message', async ({ messageId, content }) => {
    try {
      const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      
      if (!message || message.user_id !== socket.userId) {
        socket.emit('error', { message: 'Нет прав для редактирования' });
        return;
      }

      await dbRun(
        'UPDATE messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?',
        [content, messageId]
      );

      const updatedMessage = await dbGet(
        `SELECT m.*, u.username, u.avatar_url 
         FROM messages m 
         INNER JOIN users u ON m.user_id = u.id 
         WHERE m.id = ?`,
        [messageId]
      );

      // Отправка обновления в канал
      const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [message.channel_id]);
      io.to(`channel:${channel.id}`).emit('message-edited', updatedMessage);
    } catch (error) {
      console.error('Ошибка редактирования сообщения:', error);
      socket.emit('error', { message: 'Ошибка редактирования сообщения' });
    }
  });

  /**
   * Удаление сообщения
   */
  socket.on('delete-message', async ({ messageId, channelId }) => {
    try {
      const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      
      if (!message) {
        socket.emit('error', { message: 'Сообщение не найдено' });
        return;
      }

      // Проверка прав (автор или владелец сервера)
      const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [message.channel_id]);
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [channel.server_id]);
      
      const canDelete = message.user_id === socket.userId || server.owner_id === socket.userId;

      if (!canDelete) {
        socket.emit('error', { message: 'Нет прав для удаления' });
        return;
      }

      await dbRun('DELETE FROM messages WHERE id = ?', [messageId]);
      
      io.to(`channel:${channelId}`).emit('message-deleted', { messageId });
    } catch (error) {
      console.error('Ошибка удаления сообщения:', error);
      socket.emit('error', { message: 'Ошибка удаления сообщения' });
    }
  });

  /**
   * Добавление реакции
   */
  socket.on('add-reaction', async ({ messageId, emoji }) => {
    try {
      // Добавление или удаление реакции
      try {
        await dbRun(
          'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
          [messageId, socket.userId, emoji]
        );
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
          await dbRun(
            'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
            [messageId, socket.userId, emoji]
          );
        } else {
          throw error;
        }
      }

      // Получение всех реакций
      const reactions = await dbAll(
        `SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
         FROM message_reactions 
         WHERE message_id = ?
         GROUP BY emoji`,
        [messageId]
      );

      const message = await dbGet('SELECT channel_id FROM messages WHERE id = ?', [messageId]);
      io.to(`channel:${message.channel_id}`).emit('reaction-added', {
        messageId,
        reactions,
        userId: socket.userId,
        emoji
      });
    } catch (error) {
      console.error('Ошибка добавления реакции:', error);
      socket.emit('error', { message: 'Ошибка добавления реакции' });
    }
  });

  /**
   * Изменение статуса пользователя
   */
  socket.on('user-status-change', async ({ status }) => {
    try {
      const validStatuses = ['online', 'offline', 'idle', 'dnd', 'invisible'];
      if (!validStatuses.includes(status)) {
        return;
      }

      await dbRun('UPDATE users SET status = ? WHERE id = ?', [status, socket.userId]);
      
      socket.broadcast.emit('user-status-changed', {
        userId: socket.userId,
        status
      });
    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
    }
  });

  /**
   * WebRTC сигналинг - Voice Offer
   */
  socket.on('voice-offer', ({ targetUserId, offer, channelId }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('voice-offer', {
        fromUserId: socket.userId,
        offer,
        channelId
      });
    }
  });

  /**
   * WebRTC сигналинг - Voice Answer
   */
  socket.on('voice-answer', ({ targetUserId, answer }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('voice-answer', {
        fromUserId: socket.userId,
        answer
      });
    }
  });

  /**
   * WebRTC сигналинг - ICE Candidate
   */
  socket.on('ice-candidate', ({ targetUserId, candidate }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        fromUserId: socket.userId,
        candidate
      });
    }
  });

  /**
   * WebRTC сигналинг - Video Offer
   */
  socket.on('video-offer', ({ targetUserId, offer }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('video-offer', {
        fromUserId: socket.userId,
        offer
      });
    }
  });

  /**
   * Отправка DM через Socket.IO
   */
  socket.on('send-dm', async ({ receiverId, content }) => {
    try {
      const receiverSocketId = activeUsers.get(parseInt(receiverId));
      
      // Сохранение в БД
      const result = await dbRun(
        'INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
        [socket.userId, receiverId, content]
      );

      const message = await dbGet(
        `SELECT dm.*, 
         sender.username as sender_username, sender.avatar_url as sender_avatar,
         receiver.username as receiver_username, receiver.avatar_url as receiver_avatar
         FROM direct_messages dm
         INNER JOIN users sender ON dm.sender_id = sender.id
         INNER JOIN users receiver ON dm.receiver_id = receiver.id
         WHERE dm.id = ?`,
        [result.lastID]
      );

      // Отправка отправителю
      socket.emit('new-dm', message);

      // Отправка получателю если онлайн
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new-dm', message);
      }
    } catch (error) {
      console.error('Ошибка отправки DM:', error);
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });

  /**
   * Инициация звонка
   */
  socket.on('call-user', ({ targetUserId, callType }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', {
        fromUserId: socket.userId,
        fromUsername: socket.username,
        callType: callType || 'voice' // voice или video
      });
    } else {
      socket.emit('call-error', { message: 'Пользователь не в сети' });
    }
  });

  /**
   * Принятие звонка
   */
  socket.on('accept-call', ({ targetUserId }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-accepted', {
        fromUserId: socket.userId
      });
    }
  });

  /**
   * Отклонение звонка
   */
  socket.on('reject-call', ({ targetUserId }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-rejected', {
        fromUserId: socket.userId
      });
    }
  });

  /**
   * Завершение звонка
   */
  socket.on('end-call', ({ targetUserId }) => {
    const targetSocketId = activeUsers.get(parseInt(targetUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-ended', {
        fromUserId: socket.userId
      });
    }
  });

  /**
   * Отключение
   */
  socket.on('disconnect', () => {
    console.log(`Пользователь отключен: ${socket.userId}`);
    
    activeUsers.delete(socket.userId);

    // Обновление статуса на offline
    dbRun('UPDATE users SET status = ? WHERE id = ?', ['offline', socket.userId])
      .catch(err => console.error('Ошибка обновления статуса:', err));

    // Удаление из всех typing sets
    for (const [channelId, typingSet] of typingUsers.entries()) {
      typingSet.delete(socket.userId);
      if (typingSet.size === 0) {
        typingUsers.delete(channelId);
      }
      socket.to(`channel:${channelId}`).emit('user-stop-typing', { userId: socket.userId });
    }

    // Уведомление других пользователей
    socket.broadcast.emit('user-offline', { userId: socket.userId });
  });
});

// Обработка ошибок
app.use(notFound);
app.use(errorHandler);

// Инициализация базы данных и запуск сервера
createTables()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
      console.log(`📡 Socket.IO готов к подключениям`);
    });
  })
  .catch((error) => {
    console.error('❌ Ошибка инициализации:', error);
    process.exit(1);
  });

export default app;

