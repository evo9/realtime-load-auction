import { apiRequest } from '@/lib/api/client';
import type { JwtPayload, LoginResponse } from '@/types/contracts';

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function getMe(): Promise<JwtPayload> {
  return apiRequest<JwtPayload>('/me');
}
