

// Tasks API methods
// User/Worker types
export interface Worker {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  // Mobile Access Profile (JSON) — whether this worker can receive/see tasks.
  enabledModules?: unknown;
  lastLocation?: {
    lat: number;
    lng: number;
    accuracy: number;
    updatedAt: string;
  } | null;
}


// Users API methods
export interface InboxNotification {
  id: string;
  eventType: string;
  payload: { title?: string; body?: string; link?: string | null; [k: string]: unknown } | null;
  readAt: string | null;
  createdAt: string;
}
