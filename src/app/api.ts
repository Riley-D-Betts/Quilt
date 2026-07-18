/** Thin typed client for the Worker API. */
import {
  normalizeQuiltData,
  type Fabric,
  type FabricFields,
  type QuiltData,
  type QuiltSummary,
} from '../shared/quilt';

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

/** Upgrade any stored quilt (v1 or v2) to the current data shape. */
function normalizeSummary(q: QuiltSummary): QuiltSummary {
  return { ...q, data: normalizeQuiltData(q.data) };
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

  listQuilts: () =>
    request<{ quilts: QuiltSummary[] }>('/api/quilts').then((r) => ({
      quilts: r.quilts.map(normalizeSummary),
    })),
  createQuilt: (name?: string, data?: QuiltData) =>
    request<{ quilt: QuiltSummary }>('/api/quilts', {
      method: 'POST',
      body: JSON.stringify({ name, data }),
    }).then((r) => ({ quilt: normalizeSummary(r.quilt) })),
  getQuilt: (id: string) =>
    request<{ quilt: QuiltSummary }>(`/api/quilts/${id}`).then((r) => ({
      quilt: normalizeSummary(r.quilt),
    })),
  updateQuilt: (id: string, patch: { name?: string; data?: QuiltData }) =>
    request<{ quilt: QuiltSummary }>(`/api/quilts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }).then((r) => ({ quilt: normalizeSummary(r.quilt) })),
  copyQuilt: (id: string) =>
    request<{ quilt: QuiltSummary }>(`/api/quilts/${id}/copy`, { method: 'POST' }).then((r) => ({
      quilt: normalizeSummary(r.quilt),
    })),
  deleteQuilt: (id: string) => request<{ ok: true }>(`/api/quilts/${id}`, { method: 'DELETE' }),

  listLibraryFabrics: () => request<{ fabrics: Fabric[] }>('/api/fabrics'),
  saveLibraryFabric: (fields: FabricFields) =>
    request<{ fabric: Fabric }>('/api/fabrics', { method: 'POST', body: JSON.stringify(fields) }),
  deleteLibraryFabric: (id: string) =>
    request<{ ok: true }>(`/api/fabrics/${id}`, { method: 'DELETE' }),
};
