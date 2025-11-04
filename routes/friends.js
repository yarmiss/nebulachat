import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { dbGet, dbAll, dbRun } from '../database.js';

const router = express.Router();

/**
 * GET /api/friends
 * Получение списка друзей
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const friends = await dbAll(
      `SELECT 
        CASE 
          WHEN f.user_id_1 = ? THEN f.user_id_2
          ELSE f.user_id_1
        END as friend_id,
        u.username, u.avatar_url, u.status, u.custom_status,
        f.status as friendship_status, f.requested_by
       FROM friends f
       INNER JOIN users u ON (CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END) = u.id
       WHERE (f.user_id_1 = ? OR f.user_id_2 = ?) AND f.status = 'accepted'
       ORDER BY u.username`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json(friends);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/friends/requests
 * Получение запросов в друзья
 */
router.get('/requests', authenticateToken, async (req, res, next) => {
  try {
    const requests = await dbAll(
      `SELECT 
        CASE 
          WHEN f.user_id_1 = ? THEN f.user_id_2
          ELSE f.user_id_1
        END as user_id,
        u.username, u.avatar_url, u.status,
        f.requested_by, f.created_at
       FROM friends f
       INNER JOIN users u ON (CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END) = u.id
       WHERE (f.user_id_1 = ? OR f.user_id_2 = ?) 
         AND f.status = 'pending'
         AND f.requested_by != ?`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json(requests);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/friends/request
 * Отправка запроса в друзья
 */
router.post('/request', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId || userId === req.user.id) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    // Проверка существования пользователя
    const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Проверка существующей связи
    const existing = await dbGet(
      `SELECT * FROM friends 
       WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)`,
      [req.user.id, userId, userId, req.user.id]
    );

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Вы уже друзья' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Запрос уже отправлен' });
      }
      if (existing.status === 'blocked') {
        return res.status(403).json({ error: 'Пользователь заблокирован' });
      }
    }

    // Создание запроса
    const user1 = Math.min(req.user.id, userId);
    const user2 = Math.max(req.user.id, userId);

    await dbRun(
      'INSERT INTO friends (user_id_1, user_id_2, status, requested_by) VALUES (?, ?, ?, ?)',
      [user1, user2, 'pending', req.user.id]
    );

    res.status(201).json({ message: 'Запрос в друзья отправлен' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/friends/accept
 * Принятие запроса в друзья
 */
router.post('/accept', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }

    // Поиск запроса
    const friendship = await dbGet(
      `SELECT * FROM friends 
       WHERE ((user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?))
         AND status = 'pending'
         AND requested_by = ?`,
      [req.user.id, userId, userId, req.user.id, userId]
    );

    if (!friendship) {
      return res.status(404).json({ error: 'Запрос в друзья не найден' });
    }

    // Принятие запроса
    await dbRun(
      'UPDATE friends SET status = ? WHERE id = ?',
      ['accepted', friendship.id]
    );

    res.json({ message: 'Запрос в друзья принят' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/friends/decline
 * Отклонение запроса в друзья
 */
router.post('/decline', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }

    // Поиск запроса
    const friendship = await dbGet(
      `SELECT * FROM friends 
       WHERE ((user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?))
         AND status = 'pending'`,
      [req.user.id, userId, userId, req.user.id]
    );

    if (!friendship) {
      return res.status(404).json({ error: 'Запрос в друзья не найден' });
    }

    // Удаление запроса
    await dbRun('DELETE FROM friends WHERE id = ?', [friendship.id]);

    res.json({ message: 'Запрос в друзья отклонен' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/friends/remove
 * Удаление из друзей
 */
router.post('/remove', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }

    // Поиск дружбы
    const friendship = await dbGet(
      `SELECT * FROM friends 
       WHERE ((user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?))
         AND status = 'accepted'`,
      [req.user.id, userId, userId, req.user.id]
    );

    if (!friendship) {
      return res.status(404).json({ error: 'Дружба не найдена' });
    }

    // Удаление дружбы
    await dbRun('DELETE FROM friends WHERE id = ?', [friendship.id]);

    res.json({ message: 'Пользователь удален из друзей' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/friends/block
 * Блокировка пользователя
 */
router.post('/block', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId || userId === req.user.id) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    // Поиск или создание связи
    const existing = await dbGet(
      `SELECT * FROM friends 
       WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)`,
      [req.user.id, userId, userId, req.user.id]
    );

    if (existing) {
      await dbRun(
        'UPDATE friends SET status = ?, requested_by = ? WHERE id = ?',
        ['blocked', req.user.id, existing.id]
      );
    } else {
      const user1 = Math.min(req.user.id, userId);
      const user2 = Math.max(req.user.id, userId);
      await dbRun(
        'INSERT INTO friends (user_id_1, user_id_2, status, requested_by) VALUES (?, ?, ?, ?)',
        [user1, user2, 'blocked', req.user.id]
      );
    }

    res.json({ message: 'Пользователь заблокирован' });
  } catch (error) {
    next(error);
  }
});

export default router;

