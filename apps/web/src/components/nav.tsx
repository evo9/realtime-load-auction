'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';

export function Nav() {
  const { user, logout } = useAuth();

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <Link href="/lots" className="text-sm font-medium">
        Лоты
      </Link>
      <div className="flex items-center gap-4 text-sm text-zinc-500">
        {user && <span>{user.email}</span>}
        <button
          type="button"
          onClick={logout}
          className="font-medium text-zinc-900 dark:text-zinc-50"
        >
          Выйти
        </button>
      </div>
    </nav>
  );
}
