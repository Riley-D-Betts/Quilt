/** Thin typed client for the Worker API. */
import type { QuiltData, QuiltSummary } from '../shared/quilt';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response (e.g. HTML error page)
  }
  if (!res.ok) {
    throw new ApiError(body?.error ?? `Request failed (${res.status}).`, res.status);
  }
  return body as T;
}

export const api = {
  register: (email: string, password: string) =>
    request<{ email: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ email: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ email: string }>('/api/auth/me'),

  listQuilts: () => request<{ quilts: QuiltSummary[] }>('/api/quilts'),
  createQuilt: (name?: string, data?: QuiltData) =>
    request<{ quilt: QuiltSummary }>('/api/quilts', {
      method: 'POST',
      body: JSON.stringify({ name, data }),
    }),
  getQuilt: (id: string) => request<{ quilt: QuiltSummary }>(`/api/quilts/${id}`),
  updateQuilt: (id: string, patch: { name?: string; data?: QuiltData }) =>
    request<{ quilt: QuiltSummary }>(`/api/quilts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  copyQuilt: (id: string) =>
    request<{ quilt: QuiltSummary }>(`/api/quilts/${id}/copy`, { method: 'POST' }),
  deleteQuilt: (id: string) => request<{ ok: true }>(`/api/quilts/${id}`, { method: 'DELETE' }),
};
