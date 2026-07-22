import { apiRequest } from '@/lib/api/client';
import type {
  BidHistoryResponse,
  BidView,
  GetLotBidsQuery,
  JwtPayload,
  ListLotsQuery,
  ListLotsResponse,
  LoginResponse,
  LotResponseDto,
} from '@/types/contracts';

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function getMe(token?: string): Promise<JwtPayload> {
  return apiRequest<JwtPayload>('/me', { token });
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

export function getLot(lotId: string, token?: string): Promise<LotResponseDto> {
  return apiRequest<LotResponseDto>(`/lots/${lotId}`, { token });
}

export function getLotBids(
  lotId: string,
  query: GetLotBidsQuery = {},
  token?: string,
): Promise<BidHistoryResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return apiRequest<BidHistoryResponse>(
    `/lots/${lotId}/bids${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export function placeBid(
  lotId: string,
  amount: number,
  idempotencyKey: string,
  token?: string,
): Promise<BidView> {
  return apiRequest<BidView>(`/lots/${lotId}/bids`, {
    method: 'POST',
    body: { amount },
    headers: { 'Idempotency-Key': idempotencyKey },
    token,
  });
}
