// Простой WebSocket сервер для локальной разработки
// Установите: npm install ws
// Запустите: node websocket-server.js

const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
const rooms = new Map(); // Хранилище комнат и сообщений

console.log('WebSocket сервер запущен на ws://localhost:8080');

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get('room') || 'general';
    
    console.log(`Новое подключение к комнате: ${roomId}`);
    
    // Создаем комнату если её нет
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            clients: [],
            messages: []
        });
    }
    
    const room = rooms.get(roomId);
    room.clients.push(ws);
    
    // Отправляем историю сообщений новому клиенту
    if (room.messages.length > 0) {
        ws.send(JSON.stringify({
            type: 'history',
            messages: room.messages.slice(-50) // Последние 50 сообщений
        }));
    }
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'message') {
                // Сохраняем сообщение
                const msgData = {
                    id: data.id || Math.random().toString(36).substring(7),
                    userId: data.userId,
                    text: data.text,
                    timestamp: data.timestamp || Date.now(),
                    channel: data.channel || roomId
                };
                
                room.messages.push(msgData);
                // Храним максимум 1000 сообщений
                if (room.messages.length > 1000) {
                    room.messages.shift();
                }
                
                // Рассылаем всем клиентам в комнате
                room.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'new_message',
                            data: msgData
                        }));
                    }
                });
            } else if (data.type === 'user_update') {
                // Рассылаем обновление пользователя
                room.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'user_update',
                            data: data.data
                        }));
                    }
                });
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    });
    
    ws.on('close', () => {
        console.log(`Отключение от комнаты: ${roomId}`);
        const index = room.clients.indexOf(ws);
        if (index > -1) {
            room.clients.splice(index, 1);
        }
        
        // Удаляем комнату если в ней нет клиентов
        if (room.clients.length === 0) {
            rooms.delete(roomId);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket ошибка:', error);
    });
});
