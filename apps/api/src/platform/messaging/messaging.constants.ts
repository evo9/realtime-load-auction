export const Exchanges = {
  events: 'auction.events',
  settlementCommands: 'settlement.commands',
  retry: 'auction.retry',
  dlx: 'auction.dlx',
} as const;

export const RoutingKeys = {
  lotOpened: 'lot.opened',
  lotClosing: 'lot.closing',
  lotClosed: 'lot.closed',
  bidPlaced: 'bid.placed',
  settlementCompleted: 'settlement.completed',
  settlementFailed: 'settlement.failed',
  lotCancelled: 'lot.cancelled',
} as const;

export const Queues = {
  notification: 'notification.q',
  settlement: 'settlement.q',
  listing: 'listing.q',
  settlementSteps: 'settlement.steps.q',
} as const;

interface QueueBinding {
  exchange: string;
  keys: string[];
}

interface ConsumerQueueDescriptor {
  name: string;
  bindings: QueueBinding[];
}

export const CONSUMER_QUEUES: ConsumerQueueDescriptor[] = [
  {
    name: Queues.notification,
    bindings: [
      {
        exchange: Exchanges.events,
        keys: ['bid.placed', 'lot.opened', 'lot.closed'],
      },
    ],
  },
  {
    name: Queues.settlement,
    bindings: [{ exchange: Exchanges.events, keys: ['lot.closed'] }],
  },
  {
    name: Queues.listing,
    bindings: [
      { exchange: Exchanges.events, keys: ['lot.opened', 'lot.closed'] },
    ],
  },
  {
    name: Queues.settlementSteps,
    bindings: [
      { exchange: Exchanges.settlementCommands, keys: ['settlement.step'] },
    ],
  },
];

export const retryQueueName = (queue: string): string =>
  `${queue.replace(/\.q$/, '')}.retry.q`;

export const dlqName = (queue: string): string =>
  `${queue.replace(/\.q$/, '')}.dlq`;
