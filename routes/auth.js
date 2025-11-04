import express from 'express';
import bcrypt from 'bcryptjs';
import { dbGet, dbRun } from '../database.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { validateRegister, validateLogin } from '../utils/validators.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Регистрация нового пользователя
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Валидация
    const validation = validateRegister(username, email, password);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    // Проверка существования пользователя
    const existingUser = await dbGet(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email или username уже существует' });
    }

    // Хеширование пароля
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Создание пользователя
    const result = await dbRun(
      'INSERT INTO users (username, email, password_hash, status) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, 'offline']
    );

    const userId = result.lastID;

    // Генерация токенов
    const user = { id: userId, username, email };
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: {
        id: userId,
        username,
        email,
        status: 'offline'
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Вход пользователя
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Валидация
    const validation = validateLogin(email, password);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    // Поиск пользователя
    const user = await dbGet(
      'SELECT id, username, email, password_hash, avatar_url, status, custom_status FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Проверка пароля
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Обновление статуса
    await dbRun('UPDATE users SET status = ? WHERE id = ?', ['online', user.id]);

    // Генерация токенов
    const tokenUser = { id: user.id, username: user.username, email: user.email };
    const accessToken = generateAccessToken(tokenUser);
    const refreshToken = generateRefreshToken(tokenUser);

    res.json({
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        status: 'online',
        custom_status: user.custom_status
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Обновление access токена
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh токен отсутствует' });
    }

    // Верификация refresh токена
    const decoded = await verifyRefreshToken(refreshToken);

    // Получение пользователя
    const user = await dbGet(
      'SELECT id, username, email FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    // Генерация нового access токена
    const tokenUser = { id: user.id, username: user.username, email: user.email };
    const newAccessToken = generateAccessToken(tokenUser);

    res.json({
      accessToken: newAccessToken
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Выход пользователя
 */
router.post('/logout', async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (userId) {
      // Обновление статуса на offline
      await dbRun('UPDATE users SET status = ? WHERE id = ?', ['offline', userId]);
    }

    res.json({ message: 'Выход выполнен успешно' });
  } catch (error) {
    next(error);
  }
});

export default router;

