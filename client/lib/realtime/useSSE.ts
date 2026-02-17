"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type RealtimeType =
  | "LOG_CREATED"
  | "ABUSE_FLAG_CREATED"
  | "TICKET_CREATED"
  | "TICKET_UPDATED"
  | "REPORT_CREATED"
  | "REPORT_MODERATED"
  | "KEY_STATUS_CHANGED"
  | "IP_RULE_CHANGED"
  | "INCIDENT_CHANGED";

export type RealtimeEvent<T = Record<string, unknown>> = {
  type: RealtimeType;
  createdAt: string;
  payload: T;
};

type Handlers = {
  onEvent?: (event: RealtimeEvent) => void;
  onLogCreated?: (event: RealtimeEvent) => void;
  onAbuseFlagCreated?: (event: RealtimeEvent) => void;
  onTicketCreated?: (event: RealtimeEvent) => void;
  onTicketUpdated?: (event: RealtimeEvent) => void;
  onReportCreated?: (event: RealtimeEvent) => void;
  onReportModerated?: (event: RealtimeEvent) => void;
  onKeyStatusChanged?: (event: RealtimeEvent) => void;
  onIpRuleChanged?: (event: RealtimeEvent) => void;
  onIncidentChanged?: (event: RealtimeEvent) => void;
};

const EVENT_TYPES: RealtimeType[] = [
  "LOG_CREATED",
  "ABUSE_FLAG_CREATED",
  "TICKET_CREATED",
  "TICKET_UPDATED",
  "REPORT_CREATED",
  "REPORT_MODERATED",
  "KEY_STATUS_CHANGED",
  "IP_RULE_CHANGED",
  "INCIDENT_CHANGED"
];

export function useSSE(url: string, handlers: Handlers = {}) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stableHandlers = useMemo(() => handlers, [handlers]);

  useEffect(() => {
    abortRef.current = new AbortController();
    let mounted = true;

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeCurrent = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };

    const dispatch = (event: RealtimeEvent) => {
      stableHandlers.onEvent?.(event);
      if (event.type === "LOG_CREATED") stableHandlers.onLogCreated?.(event);
      if (event.type === "ABUSE_FLAG_CREATED") stableHandlers.onAbuseFlagCreated?.(event);
      if (event.type === "TICKET_CREATED") stableHandlers.onTicketCreated?.(event);
      if (event.type === "TICKET_UPDATED") stableHandlers.onTicketUpdated?.(event);
      if (event.type === "REPORT_CREATED") stableHandlers.onReportCreated?.(event);
      if (event.type === "REPORT_MODERATED") stableHandlers.onReportModerated?.(event);
      if (event.type === "KEY_STATUS_CHANGED") stableHandlers.onKeyStatusChanged?.(event);
      if (event.type === "IP_RULE_CHANGED") stableHandlers.onIpRuleChanged?.(event);
      if (event.type === "INCIDENT_CHANGED") stableHandlers.onIncidentChanged?.(event);
    };

    const connect = () => {
      if (!mounted || abortRef.current?.signal.aborted) return;
      if (typeof EventSource === "undefined") {
        setConnected(false);
        setReconnecting(false);
        setError("sse_unsupported");
        return;
      }
      clearReconnect();

      const endpoint = lastEventIdRef.current
        ? `${url}${url.includes("?") ? "&" : "?"}lastEventId=${encodeURIComponent(lastEventIdRef.current)}`
        : url;

      const es = new EventSource(endpoint, { withCredentials: true });
      esRef.current = es;

      es.onopen = () => {
        if (!mounted) return;
        setConnected(true);
        setReconnecting(false);
        setError(null);
        setAttempt(0);
      };

      es.onerror = () => {
        if (!mounted || abortRef.current?.signal.aborted) return;
        setConnected(false);
        setReconnecting(true);
        closeCurrent();
        setError("stream_disconnected");
        setAttempt((prev) => {
          const next = prev + 1;
          const wait = Math.min(30000, 1000 * Math.pow(2, Math.min(next, 5)));
          reconnectTimerRef.current = setTimeout(connect, wait);
          return next;
        });
      };

      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (msg: MessageEvent) => {
          if (!mounted) return;
          try {
            if (msg.lastEventId) lastEventIdRef.current = msg.lastEventId;
            const parsed = JSON.parse(msg.data) as RealtimeEvent;
            dispatch(parsed);
          } catch {
            setError("invalid_event_payload");
          }
        });
      }
    };

    connect();

    return () => {
      mounted = false;
      abortRef.current?.abort();
      clearReconnect();
      closeCurrent();
      setConnected(false);
    };
  }, [url, stableHandlers]);

  return { connected, reconnecting, attempt, error };
}
