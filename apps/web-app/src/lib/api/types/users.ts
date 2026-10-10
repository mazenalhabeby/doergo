


// Users API methods
export interface InboxNotification {
  id: string;
  eventType: string;
  payload: { title?: string; body?: string; link?: string | null; [k: string]: unknown } | null;
  readAt: string | null;
  createdAt: string;
}
