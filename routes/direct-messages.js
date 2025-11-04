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
 * GET /api/direct-messages
 * Получение списка всех DM для текущего пользователя
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    // Получаем все DM где пользователь участник
    const dms = await dbAll(
      `SELECT DISTINCT
        CASE 
          WHEN dm.sender_id = ? THEN dm.receiver_id
          ELSE dm.sender_id
        END as other_user_id,
        u.username, u.avatar_url, u.status, u.custom_status,
        MAX(dm.created_at) as last_message_time,
        (SELECT content FROM direct_messages 
         WHERE (sender_id = ? AND receiver_id = u.id) 
            OR (sender_id = u.id AND receiver_id = ?)
         ORDER BY created_at DESC LIMIT 1) as last_message
       FROM direct_messages dm
       INNER JOIN users u ON (CASE WHEN dm.sender_id = ? THEN dm.receiver_id ELSE dm.sender_id END) = u.id
       WHERE dm.sender_id = ? OR dm.receiver_id = ?
       GROUP BY other_user_id
       ORDER BY last_message_time DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json(dms);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/direct-messages/:userId
 * Получение сообщений с конкретным пользователем
 */
router.get('/:userId', authenticateToken, async (req, res, next) => {
  try {
    const otherUserId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before ? parseInt(req.query.before) : null;

    if (otherUserId === req.user.id) {
      return res.status(400).json({ error: 'Нельзя получить сообщения с самим собой' });
    }

    // Проверка существования пользователя
    const otherUser = await dbGet('SELECT id, username FROM users WHERE id = ?', [otherUserId]);
    if (!otherUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Получение сообщений
    let query = `
      SELECT dm.*, 
             sender.username as sender_username, sender.avatar_url as sender_avatar,
             receiver.username as receiver_username, receiver.avatar_url as receiver_avatar
      FROM direct_messages dm
      INNER JOIN users sender ON dm.sender_id = sender.id
      INNER JOIN users receiver ON dm.receiver_id = receiver.id
      WHERE (dm.sender_id = ? AND dm.receiver_id = ?) OR (dm.sender_id = ? AND dm.receiver_id = ?)
    `;
    const params = [req.user.id, otherUserId, otherUserId, req.user.id];

    if (before) {
      query += ' AND dm.id < ?';
      params.push(before);
    }

    query += ' ORDER BY dm.created_at DESC LIMIT ?';
    params.push(limit);

    const messages = await dbAll(query, params);

    res.json({
      messages: messages.reverse(),
      otherUser: {
        id: otherUser.id,
        username: otherUser.username
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/direct-messages/:userId
 * Отправка сообщения пользователю
 */
router.post('/:userId', authenticateToken, upload.array('files', 10), async (req, res, next) => {
  try {
    const otherUserId = parseInt(req.params.userId);
    const { content } = req.body;

    if (otherUserId === req.user.id) {
      return res.status(400).json({ error: 'Нельзя отправить сообщение самому себе' });
    }

    // Проверка существования пользователя
    const otherUser = await dbGet('SELECT id FROM users WHERE id = ?', [otherUserId]);
    if (!otherUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Создание сообщения
    const result = await dbRun(
      'INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [req.user.id, otherUserId, content || null]
    );

    // Получение полного сообщения
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

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

export default router;

