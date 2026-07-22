import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type {
  BidHistoryResponse,
  BidView,
  DlqQueueSummaryDto,
  GetLotBidsQuery,
  GetMyBidsQuery,
  JwtPayload,
  ListLotsQuery,
  ListLotsResponse,
  ListSagasQuery,
  LoginResponse,
  LotResponseDto,
  MyBidsResponse,
  SagaOpsDto,
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
  return apiRequest<ListLotsResponse>(`/lots${toQueryString(query)}`, { token });
}

export function getLot(lotId: string, token?: string): Promise<LotResponseDto> {
  return apiRequest<LotResponseDto>(`/lots/${lotId}`, { token });
}

export function getLotBids(
  lotId: string,
  query: GetLotBidsQuery = {},
  token?: string,
): Promise<BidHistoryResponse> {
  return apiRequest<BidHistoryResponse>(
    `/lots/${lotId}/bids${toQueryString(query)}`,
    { token },
  );
}

export function getMyBids(
  query: GetMyBidsQuery = {},
  token?: string,
): Promise<MyBidsResponse> {
  return apiRequest<MyBidsResponse>(`/me/bids${toQueryString(query)}`, { token });
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

export function getOpsSagas(
  query: ListSagasQuery = {},
  token?: string,
): Promise<SagaOpsDto[]> {
  return apiRequest<SagaOpsDto[]>(`/ops/sagas${toQueryString(query)}`, { token });
}

export function getOpsDlq(
  limit?: number,
  token?: string,
): Promise<DlqQueueSummaryDto[]> {
  return apiRequest<DlqQueueSummaryDto[]>(`/ops/dlq${toQueryString({ limit })}`, {
    token,
  });
}
