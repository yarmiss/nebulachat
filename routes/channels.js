import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { dbGet, dbAll, dbRun } from '../database.js';

const router = express.Router();

/**
 * GET /api/servers/:serverId/channels
 * Получение каналов сервера
 */
router.get('/servers/:serverId/channels', authenticateToken, async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId);

    // Проверка участия в сервере
    const member = await dbGet(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]
    );

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого сервера' });
    }

    const channels = await dbAll(
      'SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC',
      [serverId]
    );

    res.json(channels);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/servers/:serverId/channels
 * Создание нового канала
 */
router.post('/servers/:serverId/channels', authenticateToken, async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const { name, type, category_id } = req.body;

    // Проверка участия и прав (упрощенная версия - только владелец)
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    const member = await dbGet(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]
    );

    if (!member && server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет прав для создания канала' });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Название канала обязательно' });
    }

    const validTypes = ['text', 'voice', 'video', 'forum'];
    const channelType = validTypes.includes(type) ? type : 'text';

    // Получение максимальной позиции
    const maxPos = await dbGet(
      'SELECT MAX(position) as max FROM channels WHERE server_id = ?',
      [serverId]
    );
    const position = (maxPos?.max ?? -1) + 1;

    const result = await dbRun(
      'INSERT INTO channels (server_id, name, type, category_id, position) VALUES (?, ?, ?, ?, ?)',
      [serverId, name.trim(), channelType, category_id || null, position]
    );

    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [result.lastID]);
    res.status(201).json(channel);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/channels/:id
 * Обновление канала
 */
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const channelId = parseInt(req.params.id);
    const { name } = req.body;

    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    // Проверка прав (владелец сервера)
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [channel.server_id]);
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет прав для изменения канала' });
    }

    if (name) {
      await dbRun('UPDATE channels SET name = ? WHERE id = ?', [name.trim(), channelId]);
    }

    const updatedChannel = await dbGet('SELECT * FROM channels WHERE id = ?', [channelId]);
    res.json(updatedChannel);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/channels/:id
 * Удаление канала
 */
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const channelId = parseInt(req.params.id);

    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    // Проверка прав (владелец сервера)
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [channel.server_id]);
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет прав для удаления канала' });
    }

    await dbRun('DELETE FROM channels WHERE id = ?', [channelId]);
    res.json({ message: 'Канал удален успешно' });
  } catch (error) {
    next(error);
  }
});

export default router;

