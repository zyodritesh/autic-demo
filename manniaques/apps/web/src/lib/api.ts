const API_BASE = '';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'error' in body ? String((body as { error: string }).error) : 'Request failed');
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
