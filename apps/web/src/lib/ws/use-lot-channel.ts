'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { createRealtimeSocket } from '@/lib/ws/socket';
import { REALTIME_EVENT_TYPES, type RealtimeEventType } from '@/types/contracts';

type LotChannelHandlers = Partial<
  Record<RealtimeEventType, (payload: unknown) => void>
>;

interface UseLotChannelOptions {
  // Fires on every 'connect' — including reconnects after a dropped socket —
  // so callers can refetch and self-heal from whatever they missed while
  // disconnected, instead of trusting the cache blindly forever.
  onConnect?: () => void;
}

export function useLotChannel(
  lotId: string | undefined,
  handlers: LotChannelHandlers = {},
  options: UseLotChannelOptions = {},
): void {
  const { token } = useAuth();
  const handlersRef = useRef(handlers);
  const optionsRef = useRef(options);

  useEffect(() => {
    handlersRef.current = handlers;
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!token || !lotId) return;

    const socket = createRealtimeSocket(token);
    const listeners = REALTIME_EVENT_TYPES.map((type) => {
      const listener = (payload: unknown) => {
        handlersRef.current[type]?.(payload);
      };
      socket.on(type, listener);
      return { type, listener };
    });

    socket.on('connect', () => {
      socket.emit('subscribe', { lotId });
      optionsRef.current.onConnect?.();
    });

    socket.connect();

    return () => {
      listeners.forEach(({ type, listener }) => socket.off(type, listener));
      socket.emit('unsubscribe', { lotId });
      socket.disconnect();
    };
  }, [token, lotId]);
}
