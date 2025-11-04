import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { dbGet, dbAll, dbRun } from '../database.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 52428800 }, // 50MB
});

/**
 * GET /api/channels/:channelId/messages
 * Получение сообщений канала
 */
router.get('/channels/:channelId/messages', authenticateToken, async (req, res, next) => {
  try {
    const channelId = parseInt(req.params.channelId);
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before ? parseInt(req.query.before) : null;

    // Проверка доступа к каналу
    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    const member = await dbGet(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [channel.server_id, req.user.id]
    );

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к этому каналу' });
    }

    // Получение сообщений
    let query = `
      SELECT m.*, u.username, u.avatar_url,
      (SELECT COUNT(*) FROM message_reactions WHERE message_id = m.id) as reaction_count
      FROM messages m
      INNER JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = ?
    `;
    const params = [channelId];

    if (before) {
      query += ' AND m.id < ?';
      params.push(before);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(limit);

    const messages = await dbAll(query, params);

    // Получение вложений для каждого сообщения
    for (const message of messages) {
      const attachments = await dbAll(
        'SELECT * FROM attachments WHERE message_id = ?',
        [message.id]
      );
      message.attachments = attachments;
    }

    res.json(messages.reverse()); // Обратный порядок для отображения
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/channels/:channelId/messages
 * Отправка сообщения
 */
router.post('/channels/:channelId/messages', authenticateToken, upload.array('files', 10), async (req, res, next) => {
  try {
    const channelId = parseInt(req.params.channelId);
    const { content } = req.body;

    // Проверка доступа
    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    if (channel.type !== 'text' && channel.type !== 'forum') {
      return res.status(400).json({ error: 'Сообщения можно отправлять только в текстовые каналы' });
    }

    const member = await dbGet(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [channel.server_id, req.user.id]
    );

    if (!member) {
      return res.status(403).json({ error: 'Нет доступа к этому каналу' });
    }

    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Создание сообщения
    const result = await dbRun(
      'INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)',
      [channelId, req.user.id, content || null]
    );

    const messageId = result.lastID;

    // Загрузка вложений
    const attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileUrl = `/uploads/${file.filename}`;
        const attachmentResult = await dbRun(
          'INSERT INTO attachments (message_id, user_id, filename, file_url, file_size, file_type) VALUES (?, ?, ?, ?, ?, ?)',
          [messageId, req.user.id, file.originalname, fileUrl, file.size, file.mimetype]
        );
        attachments.push({
          id: attachmentResult.lastID,
          filename: file.originalname,
          file_url: fileUrl,
          file_size: file.size,
          file_type: file.mimetype
        });
      }
    }

    // Получение полного сообщения
    const message = await dbGet(
      `SELECT m.*, u.username, u.avatar_url 
       FROM messages m 
       INNER JOIN users u ON m.user_id = u.id 
       WHERE m.id = ?`,
      [messageId]
    );

    message.attachments = attachments;

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/messages/:id
 * Редактирование сообщения
 */
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id);
    const { content } = req.body;

    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    // Только автор может редактировать
    if (message.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Вы можете редактировать только свои сообщения' });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Содержимое сообщения не может быть пустым' });
    }

    await dbRun(
      'UPDATE messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content.trim(), messageId]
    );

    const updatedMessage = await dbGet(
      `SELECT m.*, u.username, u.avatar_url 
       FROM messages m 
       INNER JOIN users u ON m.user_id = u.id 
       WHERE m.id = ?`,
      [messageId]
    );

    res.json(updatedMessage);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/messages/:id
 * Удаление сообщения
 */
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id);

    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    // Автор или модератор может удалить
    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [message.channel_id]);
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [channel.server_id]);

    const canDelete = message.user_id === req.user.id || server.owner_id === req.user.id;

    if (!canDelete) {
      return res.status(403).json({ error: 'Нет прав для удаления сообщения' });
    }

    // Удаление вложений
    const attachments = await dbAll('SELECT * FROM attachments WHERE message_id = ?', [messageId]);
    for (const attachment of attachments) {
      if (attachment.file_url.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, '..', attachment.file_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      await dbRun('DELETE FROM attachments WHERE id = ?', [attachment.id]);
    }

    await dbRun('DELETE FROM messages WHERE id = ?', [messageId]);
    res.json({ message: 'Сообщение удалено успешно' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/messages/:id/reactions
 * Добавление реакции на сообщение
 */
router.post('/:id/reactions', authenticateToken, async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id);
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji обязателен' });
    }

    // Проверка существования сообщения
    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    // Добавление реакции (или удаление если уже есть)
    try {
      await dbRun(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
        [messageId, req.user.id, emoji]
      );
    } catch (error) {
      // Если реакция уже есть, удаляем её
      if (error.code === 'SQLITE_CONSTRAINT') {
        await dbRun(
          'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
          [messageId, req.user.id, emoji]
        );
        return res.json({ message: 'Реакция удалена', removed: true });
      }
      throw error;
    }

    // Получение всех реакций сообщения
    const reactions = await dbAll(
      `SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
       FROM message_reactions 
       WHERE message_id = ?
       GROUP BY emoji`,
      [messageId]
    );

    res.json({ message: 'Реакция добавлена', reactions });
  } catch (error) {
    next(error);
  }
});

export default router;

