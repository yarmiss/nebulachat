// ===== Service Worker для offline режима =====
const CACHE_NAME = 'discord-clone-v1';
const urlsToCache = [
  '/',
  '/styles.css',
  '/app.js',
  '/socket-events.js',
  '/webrtc.js',
  '/manifest.json'
];

// ===== Установка Service Worker =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Кеш открыт');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Ошибка кеширования:', error);
      })
  );
});

// ===== Активация Service Worker =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Удаление старого кеша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ===== Перехват запросов =====
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Возвращаем кешированный ответ или делаем запрос
        return response || fetch(event.request)
          .then((response) => {
            // Проверяем, валидный ли ответ
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Клонируем ответ
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Если запрос не удался, возвращаем offline страницу
            if (event.request.destination === 'document') {
              return caches.match('/');
            }
          });
      })
  );
});

// ===== Push уведомления =====
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const title = data.title || 'Discord Clone';
  const options = {
    body: data.body || 'Новое уведомление',
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-96x96.png',
    tag: data.tag || 'notification',
    data: data.data || {},
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ===== Клик по уведомлению =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // Если есть открытое окно, фокусируемся на нем
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Иначе открываем новое окно
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ===== Синхронизация в фоне =====
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      // Синхронизация сообщений
      syncMessages()
    );
  }
});

async function syncMessages() {
  // Логика синхронизации сообщений
  // Можно сохранять сообщения в IndexedDB и отправлять при восстановлении соединения
  console.log('Синхронизация сообщений...');
}

// ===== Сообщения от клиента =====
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

