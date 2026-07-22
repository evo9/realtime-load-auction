'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

export function AuthGuard() {
  const router = useRouter();
  const { token, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!token) router.replace('/auth/login');
  }, [isLoading, token, router]);

  return null;
}
