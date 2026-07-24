import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;
let hasConnectedBefore = false;

// ── Reconnect pubsub ────────────────────────────────────────────
// Socket.io rooms (team_<id>, zone_<id>) don't survive a reconnect — a new
// socket id means the server no longer has that socket in the room. Pages
// that joined a room (TeamDashboard, ZoneOperator) register a callback here
// so they can re-emit their join on every reconnect, not just the first
// connect. Also drives a small "reconnecting..." banner.
const reconnectListeners = new Set();
export function onSocketReconnect(cb) {
  reconnectListeners.add(cb);
  return () => reconnectListeners.delete(cb);
}

const connectionListeners = new Set();
export function onConnectionChange(cb) {
  connectionListeners.add(cb);
  return () => connectionListeners.delete(cb);
}
function emitConnectionChange(connected) {
  connectionListeners.forEach(cb => cb(connected));
}

export function getSocket() {
  if (!socketInstance) {
    // BUG FIX: this used to hardcode 'http://localhost:4000' any time the
    // page was served from localhost — correct only for `vite dev` (client
    // on 5173, backend on 4000), but WRONG for the standard single-server
    // deployment (server serves the built client + API + sockets all on
    // one port) whenever that port isn't literally 4000. The socket would
    // silently try to connect nowhere while REST fetch() calls (relative
    // URLs) kept working fine — every admin/team/zone action would look
    // like it worked (optimistic UI) but never actually reach the server.
    // `import.meta.env.DEV` is true only under `vite dev`; vite.config.js
    // already proxies /socket.io to localhost:4000 for that case, so this
    // now matches the same origin-detection the REST calls always used.
    const serverUrl = import.meta.env.VITE_SERVER_URL ||
      (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);

    socketInstance = io(serverUrl, {
      // Prefer WebSocket — fastest, lowest latency
      transports: ['websocket', 'polling'],

      // Reconnection — BGMI style: fast retries, then back off
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0.3,

      // Timeout
      timeout: 10000,
    });

    socketInstance.on('connect', () => {
      console.log('🔌 Connected:', socketInstance.id);
      emitConnectionChange(true);
      // Server sends state:sync automatically on every new connection.
      // Only fire "reconnect" work (re-joining rooms) after the FIRST
      // connect — the first one is a fresh page load, not a recovery.
      if (hasConnectedBefore) {
        reconnectListeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
      }
      hasConnectedBefore = true;
    });

    socketInstance.on('disconnect', (reason) => {
      console.warn('⚠️ Disconnected:', reason);
      emitConnectionChange(false);
    });

    socketInstance.on('reconnect_error', (err) => {
      console.warn('Reconnect failed:', err.message);
    });
  }
  return socketInstance;
}

// Simple hook for a "connected" boolean, for a reconnecting banner etc.
export function useConnectionStatus() {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => onConnectionChange(setConnected), []);
  return connected;
}

export function useSocket(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = getSocket();
    const entries = Object.entries(handlersRef.current);

    // Register all handlers
    const boundHandlers = entries.map(([event]) => {
      const fn = (...args) => handlersRef.current[event]?.(...args);
      socket.on(event, fn);
      return [event, fn];
    });

    return () => {
      boundHandlers.forEach(([event, fn]) => socket.off(event, fn));
    };
  }, []); // only runs once — handlers update via ref
}
