// Cloudflare Worker для WebSocket сервера (без Durable Objects - для бесплатного тарифа)
// Хранилище в памяти (очищается при перезапуске Worker)

const rooms = new Map(); // roomId -> { clients: Set, messages: [] }

export default {
    async fetch(request, env, ctx) {
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

        // Отправляем историю сообщений новому клиенту
        if (room.messages.length > 0) {
            server.send(JSON.stringify({
                type: 'history',
                messages: room.messages.slice(-50) // Последние 50 сообщений
            }));
        }

        // Обработка сообщений
        server.addEventListener('message', (event) => {
            handleMessage(server, event.data, room);
        });

        // Обработка отключения
        server.addEventListener('close', () => {
            room.clients.delete(server);
            // Удаляем комнату если в ней нет клиентов
            if (room.clients.size === 0) {
                rooms.delete(roomId);
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

function handleMessage(ws, data, room) {
    try {
        const message = JSON.parse(data);
        
        if (message.type === 'message') {
            // Сохраняем сообщение
            const msgData = {
                id: message.id || Math.random().toString(36).substring(7),
                userId: message.userId,
                text: message.text,
                timestamp: message.timestamp || Date.now(),
                channel: message.channel || 'general'
            };
            
            room.messages.push(msgData);
            // Храним максимум 1000 сообщений
            if (room.messages.length > 1000) {
                room.messages.shift();
            }

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
        console.error('Ошибка обработки сообщения:', e);
    }
}

function broadcast(room, message, excludeWs = null) {
    const data = JSON.stringify(message);
    room.clients.forEach((ws) => {
        if (ws !== excludeWs && ws.readyState === 1) { // WebSocket.OPEN === 1
            try {
                ws.send(data);
            } catch (e) {
                console.error('Ошибка отправки сообщения:', e);
                room.clients.delete(ws);
            }
        }
    });
}
