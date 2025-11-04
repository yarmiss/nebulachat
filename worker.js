// Cloudflare Worker для WebSocket сервера (без Durable Objects - для бесплатного тарифа)
// Хранилище в памяти (очищается при перезапуске Worker)

// Используем глобальное хранилище (работает в рамках одного изолированного контекста)
const rooms = new Map(); // roomId -> { clients: Set, messages: [] }

export default {
    async fetch(request, env, ctx) {
        // Разрешаем CORS для предварительных запросов
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader !== 'websocket') {
            return new Response('Expected WebSocket', { status: 426 });
        }

        const url = new URL(request.url);
        const roomId = url.searchParams.get('room') || 'general';
        
        // Получаем или создаем комнату
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                clients: new Set(),
                messages: []
            });
        }
        
        const room = rooms.get(roomId);

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        server.accept();
        
        // Добавляем клиента в комнату
        room.clients.add(server);
        
        console.log(`Новое подключение к комнате: ${roomId}, всего клиентов: ${room.clients.size}`);

        // Отправляем историю сообщений новому клиенту
        if (room.messages.length > 0) {
            try {
                server.send(JSON.stringify({
                    type: 'history',
                    messages: room.messages.slice(-50) // Последние 50 сообщений
                }));
            } catch (e) {
                console.error('Ошибка отправки истории:', e);
            }
        }

        // Обработка сообщений
        server.addEventListener('message', (event) => {
            try {
                handleMessage(server, event.data, room, roomId);
            } catch (e) {
                console.error('Ошибка в обработчике сообщений:', e);
            }
        });

        // Обработка отключения
        server.addEventListener('close', () => {
            room.clients.delete(server);
            console.log(`Клиент отключен от комнаты: ${roomId}, осталось клиентов: ${room.clients.size}`);
            // Удаляем комнату если в ней нет клиентов
            if (room.clients.size === 0) {
                rooms.delete(roomId);
                console.log(`Комната ${roomId} удалена (нет клиентов)`);
            }
        });

        // Обработка ошибок
        server.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
            room.clients.delete(server);
        });

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    },
};

function handleMessage(ws, data, room, roomId) {
    try {
        const message = JSON.parse(data);
        
        if (message.type === 'message') {
            // Сохраняем сообщение
            const msgData = {
                id: message.id || Math.random().toString(36).substring(7),
                userId: message.userId,
                text: message.text,
                timestamp: message.timestamp || Date.now(),
                channel: message.channel || roomId
            };
            
            room.messages.push(msgData);
            // Храним максимум 1000 сообщений
            if (room.messages.length > 1000) {
                room.messages.shift();
            }

            console.log(`Новое сообщение в комнате ${roomId} от пользователя ${msgData.userId}, клиентов: ${room.clients.size}`);

            // Рассылаем всем клиентам кроме отправителя
            broadcast(room, {
                type: 'new_message',
                data: msgData
            }, ws);
        } else if (message.type === 'user_update') {
            // Рассылаем обновление пользователя
            broadcast(room, {
                type: 'user_update',
                data: message.data
            }, ws);
        }
    } catch (e) {
        console.error('Ошибка обработки сообщения:', e, 'Data:', data);
    }
}

function broadcast(room, message, excludeWs = null) {
    const data = JSON.stringify(message);
    let sentCount = 0;
    let errorCount = 0;
    
    room.clients.forEach((ws) => {
        if (ws !== excludeWs && ws.readyState === 1) { // WebSocket.OPEN === 1
            try {
                ws.send(data);
                sentCount++;
            } catch (e) {
                console.error('Ошибка отправки сообщения:', e);
                room.clients.delete(ws);
                errorCount++;
            }
        }
    });
    
    if (sentCount > 0 || errorCount > 0) {
        console.log(`Broadcast: отправлено ${sentCount}, ошибок ${errorCount}, всего клиентов ${room.clients.size}`);
    }
}
