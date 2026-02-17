type RealtimeEventType =
  | "LOG_CREATED"
  | "ABUSE_FLAG_CREATED"
  | "TICKET_CREATED"
  | "TICKET_UPDATED"
  | "REPORT_CREATED"
  | "REPORT_MODERATED"
  | "KEY_STATUS_CHANGED"
  | "IP_RULE_CHANGED"
  | "INCIDENT_CHANGED";

export type RealtimeEvent<T extends Record<string, unknown> = Record<string, unknown>> = {
  type: RealtimeEventType;
  id: string;
  createdAt: string;
  payload: T;
  correlationId?: string;
};

type EventInput<T extends Record<string, unknown> = Record<string, unknown>> = {
  type: RealtimeEventType;
  payload: T;
  correlationId?: string;
};

type EventHandler = (event: RealtimeEvent) => void;

const handlers = new Set<EventHandler>();
const historyLimit = 500;
const history: RealtimeEvent[] = [];

function createEventId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function publish<T extends Record<string, unknown> = Record<string, unknown>>(input: EventInput<T>): RealtimeEvent<T> {
  const event: RealtimeEvent<T> = {
    type: input.type,
    id: createEventId(),
    createdAt: new Date().toISOString(),
    payload: input.payload,
    correlationId: input.correlationId
  };

  history.push(event);
  if (history.length > historyLimit) history.shift();

  for (const handler of handlers) handler(event as RealtimeEvent);
  return event;
}

export function subscribe(handler: EventHandler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function getEventsSince(lastEventId?: string) {
  if (!lastEventId) return [...history];
  const index = history.findIndex((event) => event.id === lastEventId);
  if (index < 0) return [...history];
  return history.slice(index + 1);
}
