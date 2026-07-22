'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Nav } from '@/components/nav';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!token) router.replace('/auth/login');
  }, [isLoading, token, router]);

  if (isLoading || !token) return null;

  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
