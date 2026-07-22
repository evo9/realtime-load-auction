import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/config';

export function createRealtimeSocket(token: string): Socket {
  return io(`${config.wsUrl}/realtime`, {
    autoConnect: false,
    auth: { token },
  });
}
