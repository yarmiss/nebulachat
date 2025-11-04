// ===== Durable Objects типы =====
// Этот файл содержит типы для Durable Objects, которые используются в index.ts

export interface ChatRoomState {
  sessions: Set<WebSocket>;
  messages: Array<any>;
}

export interface UserStatusState {
  statuses: Map<number, string>;
}

