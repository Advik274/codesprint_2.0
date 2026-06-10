import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    const serverUrl = import.meta.env.VITE_SERVER_URL ||
      (window.location.hostname === 'localhost'
        ? 'http://localhost:4000'
        : window.location.origin);

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
    });

    socketInstance.on('disconnect', (reason) => {
      console.warn('⚠️ Disconnected:', reason);
    });

    socketInstance.on('reconnect', (n) => {
      console.log(`✅ Reconnected after ${n} attempt(s)`);
      // Server sends state:sync automatically on new connection
    });

    socketInstance.on('reconnect_error', (err) => {
      console.warn('Reconnect failed:', err.message);
    });
  }
  return socketInstance;
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
