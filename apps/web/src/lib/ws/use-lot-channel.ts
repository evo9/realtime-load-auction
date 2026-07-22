'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { createRealtimeSocket } from '@/lib/ws/socket';
import { REALTIME_EVENT_TYPES } from '@/types/contracts';

export function useLotChannel(lotId: string | undefined): void {
  const { token } = useAuth();

  useEffect(() => {
    if (!token || !lotId) return;

    const socket = createRealtimeSocket(token);
    const handlers = REALTIME_EVENT_TYPES.map((type) => {
      const handler = (payload: unknown) => {
        console.log(`[realtime] ${type}`, payload);
      };
      socket.on(type, handler);
      return { type, handler };
    });

    socket.on('connect', () => {
      socket.emit('subscribe', { lotId });
    });

    socket.connect();

    return () => {
      handlers.forEach(({ type, handler }) => socket.off(type, handler));
      socket.emit('unsubscribe', { lotId });
      socket.disconnect();
    };
  }, [token, lotId]);
}
