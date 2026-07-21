import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { PubSub, Unsubscribe } from '@src/platform/redis/pub-sub';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import type { JwtPayload } from '@src/modules/identity/domain/jwt-payload';
import type { RealtimeEnvelope } from '@src/modules/realtime/domain/realtime-event';

const LOT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Redis subscriber connection backing PubSub is a single shared
// connection for the whole process (platform/redis/pub-sub.ts) — nothing
// isolates one socket's subscriptions from another's. Without a per-socket
// cap, one client emitting subscribe with an unbounded stream of
// well-formed-but-fake lot UUIDs could grow that shared connection's
// subscription set without limit, degrading fan-out for every other client.
const MAX_LOTS_PER_SOCKET = 50;

interface SocketData {
  user?: JwtPayload;
  lots: Set<string>;
}

type GatewaySocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

interface LotSubscription {
  ready: Promise<Unsubscribe>;
  refs: number;
}

@Injectable()
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() private readonly server!: Server;

  private readonly subscriptions = new Map<string, LotSubscription>();

  constructor(
    private readonly jwt: JwtService,
    private readonly pubSub: PubSub,
  ) {}

  async handleConnection(client: GatewaySocket): Promise<void> {
    client.data.lots = new Set();
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.debug(`connection ${client.id} rejected: no token`);
      client.disconnect(true);
      return;
    }
    try {
      client.data.user = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      this.logger.debug(`connection ${client.id} rejected: invalid token`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: GatewaySocket): Promise<void> {
    const lots = client.data.lots ?? new Set<string>();
    await Promise.all([...lots].map((lotId) => this.release(lotId)));
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() body: { lotId?: string },
  ): Promise<void> {
    if (!client.data.user) return; // not authenticated yet — ignore
    const lotId = body?.lotId;
    if (!lotId || !LOT_ID_PATTERN.test(lotId)) return;
    if (client.data.lots.has(lotId)) return;
    if (client.data.lots.size >= MAX_LOTS_PER_SOCKET) return;

    await client.join(this.room(lotId));
    client.data.lots.add(lotId);
    await this.acquire(lotId);
  }

  @SubscribeMessage('unsubscribe')
  async onUnsubscribe(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() body: { lotId?: string },
  ): Promise<void> {
    if (!client.data.user) return;
    const lotId = body?.lotId;
    if (!lotId || !client.data.lots.has(lotId)) return;

    await client.leave(this.room(lotId));
    client.data.lots.delete(lotId);
    await this.release(lotId);
  }

  private room(lotId: string): string {
    return `lot:${lotId}`;
  }

  // The map entry is reserved synchronously (before the subscribe() await
  // resolves) so a second concurrent acquire() for the same not-yet-tracked
  // lot sees it immediately and just bumps refs, instead of both racing past
  // the check and each starting their own Redis subscription — which would
  // leak the first one and double-deliver every event.
  private async acquire(lotId: string): Promise<void> {
    const existing = this.subscriptions.get(lotId);
    if (existing) {
      existing.refs += 1;
      return;
    }
    const ready = this.pubSub.subscribe<RealtimeEnvelope>(
      RedisKeys.lotChannel(lotId),
      (envelope) => {
        this.server.to(this.room(lotId)).emit(envelope.type, envelope.payload);
      },
    );
    this.subscriptions.set(lotId, { ready, refs: 1 });
    await ready;
  }

  private async release(lotId: string): Promise<void> {
    const existing = this.subscriptions.get(lotId);
    if (!existing) return;
    existing.refs -= 1;
    if (existing.refs <= 0) {
      this.subscriptions.delete(lotId);
      const unsubscribe = await existing.ready;
      await unsubscribe();
    }
  }
}
