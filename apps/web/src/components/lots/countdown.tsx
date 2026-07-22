'use client';

import { useEffect, useState } from 'react';

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'завершён';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м ${seconds}с`;
}

export function Countdown({ closeAt }: { closeAt: string }) {
  const target = new Date(closeAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return <span suppressHydrationWarning>{formatRemaining(remaining)}</span>;
}
