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
  limits: { fileSize: 10485760 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены'));
    }
  }
});

/**
 * GET /api/servers
 * Получение списка серверов пользователя
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const servers = await dbAll(
      `SELECT s.*, 
       (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
       FROM servers s
       INNER JOIN server_members sm ON s.id = sm.server_id
       WHERE sm.user_id = ?
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );

    res.json(servers);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/servers/:id
 * Получение информации о сервере
 */
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id);

    // Проверка участия в сервере
    const member = await dbGet(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]
    );

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого сервера' });
    }

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);

    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    res.json(server);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/servers
 * Создание нового сервера
 */
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Название сервера обязательно' });
    }

    // Создание сервера
    const result = await dbRun(
      'INSERT INTO servers (name, owner_id) VALUES (?, ?)',
      [name.trim(), req.user.id]
    );

    const serverId = result.lastID;

    // Добавление владельца как участника
    await dbRun(
      'INSERT INTO server_members (user_id, server_id) VALUES (?, ?)',
      [req.user.id, serverId]
    );

    // Создание канала по умолчанию
    await dbRun(
      'INSERT INTO channels (server_id, name, type, position) VALUES (?, ?, ?, ?)',
      [serverId, 'general', 'text', 0]
    );

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);

    res.status(201).json(server);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/servers/:id
 * Обновление сервера
 */
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id);
    const { name } = req.body;

    // Проверка владельца
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Только владелец может изменять сервер' });
    }

    if (name) {
      await dbRun('UPDATE servers SET name = ? WHERE id = ?', [name.trim(), serverId]);
    }

    const updatedServer = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    res.json(updatedServer);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/servers/:id/icon
 * Загрузка иконки сервера
 */
router.post('/:id/icon', authenticateToken, upload.single('icon'), async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id);

    // Проверка владельца
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет прав для изменения сервера' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const iconUrl = `/uploads/${req.file.filename}`;

    // Удаление старой иконки
    if (server.icon_url && server.icon_url.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '..', server.icon_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await dbRun('UPDATE servers SET icon_url = ? WHERE id = ?', [iconUrl, serverId]);

    res.json({
      message: 'Иконка загружена успешно',
      icon_url: iconUrl
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/servers/:id
 * Удаление сервера
 */
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id);

    // Проверка владельца
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Только владелец может удалить сервер' });
    }

    // Удаление сервера (каскадное удаление через внешние ключи)
    await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);

    res.json({ message: 'Сервер удален успешно' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/servers/:id/members
 * Получение участников сервера
 */
router.get('/:id/members', authenticateToken, async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id);

    // Проверка участия
    const member = await dbGet(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]
    );

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого сервера' });
    }

    const members = await dbAll(
      `SELECT u.id, u.username, u.avatar_url, u.status, u.custom_status, 
       sm.nickname, sm.joined_at
       FROM server_members sm
       INNER JOIN users u ON sm.user_id = u.id
       WHERE sm.server_id = ?
       ORDER BY sm.joined_at ASC`,
      [serverId]
    );

    res.json(members);
  } catch (error) {
    next(error);
  }
});

export default router;

