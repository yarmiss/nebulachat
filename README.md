# Discord Clone

Точная копия Discord интерфейса с функционалом чата, звонков и демонстрации экрана.

## Функции

- ✅ Точный интерфейс Discord
- ✅ Чат в реальном времени через WebSocket
- ✅ Голосовые звонки (WebRTC)
- ✅ Видео звонки (WebRTC)
- ✅ Демонстрация экрана
- ✅ Управление микрофоном и камерой
- ✅ Список участников
- ✅ Без авторизации - все на сайте автоматически друзья

## Установка и запуск

### Локальный запуск

Просто откройте `index.html` в браузере или используйте локальный сервер:

```bash
# Используя Python
python -m http.server 8000

# Используя Node.js (http-server)
npx http-server

# Используя PHP
php -S localhost:8000
```

Затем откройте http://localhost:8000 в браузере.

## Настройка WebSocket сервера

### Вариант 1: Cloudflare Workers (Рекомендуется)

1. Установите Wrangler CLI:
```bash
npm install -g wrangler
```

2. Войдите в Cloudflare:
```bash
wrangler login
```

3. Деплой Worker:
```bash
wrangler deploy
```

4. Получите URL вашего Worker и обновите в `script.js`:
   - Найдите строку: `const workerUrl = 'YOUR_WORKER_URL';`
   - Замените на URL вашего Worker, например: `wss://discord-websocket.your-account.workers.dev`

### Вариант 2: Использовать готовый WebSocket сервер

Если не хотите настраивать свой сервер, можете использовать бесплатные сервисы:

- **Pusher** (https://pusher.com) - 200k сообщений/день бесплатно
- **Ably** (https://ably.com) - 3M сообщений/месяц бесплатно
- **Socket.io** с бесплатным хостингом (например, Railway, Render)

### Вариант 3: Локальный WebSocket сервер для разработки

Для локальной разработки можно использовать простой Node.js сервер:

```bash
npm install ws
node websocket-server.js
```

Создайте файл `websocket-server.js`:

```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
const rooms = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get('room') || 'general';
    
    if (!rooms.has(roomId)) {
        rooms.set(roomId, []);
    }
    
    const room = rooms.get(roomId);
    room.push(ws);
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        room.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'new_message',
                    data: data
                }));
            }
        });
    });
    
    ws.on('close', () => {
        const index = room.indexOf(ws);
        if (index > -1) {
            room.splice(index, 1);
        }
    });
});
```

И обновите в `script.js`:
```javascript
const wsUrl = 'ws://localhost:8080?room=' + currentChannel;
```

## Развертывание на Cloudflare Pages

1. Зарегистрируйтесь на [Cloudflare Pages](https://pages.cloudflare.com/)

2. Подключите ваш репозиторий GitHub/GitLab/Bitbucket

3. Настройки сборки:
   - **Framework preset**: None
   - **Build command**: (оставьте пустым)
   - **Build output directory**: `/` (корневая папка)

4. Нажмите "Save and Deploy"

5. Деплой WebSocket Worker (см. раздел выше)

6. Обновите URL WebSocket в `script.js` перед деплоем

7. Ваш сайт будет доступен по адресу `https://your-project.pages.dev`

## Структура проекта

```
.
├── index.html          # Главный HTML файл
├── styles.css          # Стили Discord
├── script.js           # JavaScript функционал с WebSocket
├── worker.js           # Cloudflare Worker для WebSocket
├── wrangler.toml       # Конфигурация Cloudflare Worker
└── README.md           # Этот файл
```

## Использование

1. Откройте сайт - автоматически создастся профиль пользователя
2. Все пользователи на сайте автоматически видят друг друга
3. Напишите сообщение в чат - оно появится у всех пользователей в реальном времени
4. Нажмите на иконку телефона для голосового звонка
5. Нажмите на иконку камеры для видео звонка
6. Нажмите на иконку экрана для демонстрации экрана

## Технологии

- HTML5
- CSS3
- JavaScript (Vanilla)
- WebSocket для синхронизации сообщений
- WebRTC для звонков и видео
- Cloudflare Workers для WebSocket сервера
- LocalStorage для офлайн режима

## Примечания

- Без WebSocket сервера приложение будет работать только локально (сообщения не синхронизируются между пользователями)
- WebRTC звонки требуют HTTPS (Cloudflare Pages предоставляет это автоматически)
- Браузер запросит разрешение на доступ к микрофону/камере при первом звонке
- Cloudflare Workers имеют бесплатный тариф (100k запросов/день)

## Лицензия

MIT
