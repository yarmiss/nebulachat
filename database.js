import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DB_PATH || './discord.db';

// Создаем базу данных
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err.message);
    process.exit(1);
  }
  console.log('Подключено к SQLite базе данных');
});

// Промисы для async/await
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

// dbRun с поддержкой lastID
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          lastID: this.lastID,
          changes: this.changes
        });
      }
    });
  });
};

// Схема базы данных
const createTables = async () => {
  try {
    // Пользователи
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(32) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        status VARCHAR(20) DEFAULT 'offline',
        custom_status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Серверы
    await dbRun(`
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        icon_url TEXT,
        banner_url TEXT,
        owner_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `);

    // Каналы
    await dbRun(`
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        category_id INTEGER,
        position INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id)
      )
    `);

    // Роли
    await dbRun(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7),
        permissions BIGINT,
        position INTEGER,
        FOREIGN KEY (server_id) REFERENCES servers(id)
      )
    `);

    // Участники серверов
    await dbRun(`
      CREATE TABLE IF NOT EXISTS server_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        nickname VARCHAR(32),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, server_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (server_id) REFERENCES servers(id)
      )
    `);

    // Сообщения
    await dbRun(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT,
        edited_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Личные сообщения
    await dbRun(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id)
      )
    `);

    // Друзья
    await dbRun(`
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id_1 INTEGER NOT NULL,
        user_id_2 INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        requested_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id_1, user_id_2),
        FOREIGN KEY (user_id_1) REFERENCES users(id),
        FOREIGN KEY (user_id_2) REFERENCES users(id),
        FOREIGN KEY (requested_by) REFERENCES users(id)
      )
    `);

    // Реакции на сообщения
    await dbRun(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        emoji VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id, emoji),
        FOREIGN KEY (message_id) REFERENCES messages(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Вложения
    await dbRun(`
      CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER,
        user_id INTEGER NOT NULL,
        filename VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        file_type VARCHAR(50),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Индексы для оптимизации
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id)`);

    console.log('✅ Таблицы созданы успешно');
  } catch (error) {
    console.error('Ошибка создания таблиц:', error);
    throw error;
  }
};

// Экспорт функций для использования в других модулях
export { db, dbRun, dbGet, dbAll, createTables };

// Запуск миграций при прямом вызове
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('database.js')) {
  createTables()
    .then(() => {
      console.log('Миграция завершена');
      db.close();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ошибка миграции:', error);
      db.close();
      process.exit(1);
    });
}

