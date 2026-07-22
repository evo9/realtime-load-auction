import type { DlqQueueSummaryDto } from '@/types/contracts';

export function DlqPanel({ queues }: { queues: DlqQueueSummaryDto[] }) {
  const withMessages = queues.filter((queue) => queue.messageCount > 0);

  if (withMessages.length === 0) {
    return <p className="text-zinc-500">DLQ пусты.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {withMessages.map((queue) => (
        <details
          key={queue.dlq}
          className="rounded-md border border-zinc-200 dark:border-zinc-800"
          open
        >
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{queue.dlq}</span>
            <span className="rounded-full border border-red-400 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-400">
              {queue.messageCount}
            </span>
          </summary>
          <ul className="flex flex-col gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
            {queue.messages.map((message) => (
              <li
                key={message.messageId}
                className="rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono">{message.routingKey}</span>
                  <span className="text-zinc-500">попытка {message.attempt}</span>
                </div>
                {message.lastError && (
                  <p className="mt-1 text-red-600 dark:text-red-400">
                    {message.lastError}
                  </p>
                )}
                <pre className="mt-2 overflow-x-auto text-zinc-600 dark:text-zinc-400">
                  {message.rawBody ?? JSON.stringify(message.payload)}
                </pre>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
