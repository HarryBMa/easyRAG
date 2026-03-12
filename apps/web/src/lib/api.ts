export interface ApiError {
  detail: string;
  status: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // ignore parse error
    }
    const err: ApiError = { detail, status: res.status };
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  delete<T = void>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },

  upload<T>(path: string, formData: FormData): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      // Let browser set Content-Type with boundary
      headers: {},
      body: formData,
    });
  },
};

/* ---- Domain types ---- */

export interface Specialist {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface Document {
  id: string;
  name: string;
  status: 'processing' | 'ready' | 'error';
  created_at: string;
  specialist_id?: string;
  error?: string;
}

export interface QueryMode {
  id: string;
  name: string;
  description: string;
}

export interface QueryResponse {
  answer: string;
  sources: unknown[];
}
