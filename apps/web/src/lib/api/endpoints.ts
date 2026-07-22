import { apiRequest } from '@/lib/api/client';
import type {
  JwtPayload,
  ListLotsQuery,
  ListLotsResponse,
  LoginResponse,
} from '@/types/contracts';

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function getMe(): Promise<JwtPayload> {
  return apiRequest<JwtPayload>('/me');
}

export function listLots(
  query: ListLotsQuery = {},
  token?: string,
): Promise<ListLotsResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return apiRequest<ListLotsResponse>(`/lots${qs ? `?${qs}` : ''}`, { token });
}
