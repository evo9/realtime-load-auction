import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { Nav } from '@/components/nav';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth.token')?.value;
  if (!token) redirect('/auth/login');

  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <AuthGuard />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
