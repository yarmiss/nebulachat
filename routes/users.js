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

// Настройка multer для загрузки файлов
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
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Разрешаем только изображения для аватаров
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены'));
    }
  }
});

/**
 * GET /api/users/me
 * Получение информации о текущем пользователе
 */
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await dbGet(
      `SELECT id, username, email, avatar_url, status, custom_status, created_at 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 * Получение информации о пользователе
 */
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);

    const user = await dbGet(
      `SELECT id, username, avatar_url, status, custom_status, created_at 
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/me
 * Обновление профиля пользователя
 */
router.put('/me', authenticateToken, async (req, res, next) => {
  try {
    const { username, custom_status } = req.body;
    const updates = [];
    const values = [];

    if (username !== undefined) {
      // Проверка уникальности username
      const existing = await dbGet('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.id]);
      if (existing) {
        return res.status(400).json({ error: 'Этот username уже занят' });
      }
      updates.push('username = ?');
      values.push(username);
    }

    if (custom_status !== undefined) {
      updates.push('custom_status = ?');
      values.push(custom_status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    values.push(req.user.id);
    await dbRun(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updatedUser = await dbGet(
      'SELECT id, username, email, avatar_url, status, custom_status FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/me/avatar
 * Загрузка аватара пользователя
 */
router.post('/me/avatar', authenticateToken, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    // Удаление старого аватара (если есть)
    const user = await dbGet('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);
    if (user.avatar_url && user.avatar_url.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '..', user.avatar_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Обновление в БД
    await dbRun('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);

    res.json({
      message: 'Аватар загружен успешно',
      avatar_url: avatarUrl
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/me/status
 * Обновление статуса пользователя
 */
router.put('/me/status', authenticateToken, async (req, res, next) => {
  try {
    const { status } = req.body;

    const validStatuses = ['online', 'offline', 'idle', 'dnd', 'invisible'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Неверный статус' });
    }

    await dbRun('UPDATE users SET status = ? WHERE id = ?', [status, req.user.id]);

    res.json({ message: 'Статус обновлен', status });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/search?q=query
 * Поиск пользователей
 */
router.get('/search', authenticateToken, async (req, res, next) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;

    if (query.length < 2) {
      return res.json([]);
    }

    const users = await dbAll(
      `SELECT id, username, avatar_url, status, custom_status 
       FROM users 
       WHERE username LIKE ? OR email LIKE ? 
       LIMIT ?`,
      [`%${query}%`, `%${query}%`, limit]
    );

    res.json(users);
  } catch (error) {
    next(error);
  }
});

export default router;

