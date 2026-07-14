/**
 * Central API handler.
 *
 * - Auto-injects Bearer token from authService
 * - Base URL from SERVER_API_BASE_URL env var (set to the backend origin, e.g.
 *   http://localhost:4100 in dev — see apps/editor/.env). Defaults to '' (same origin).
 * - Throws ApiError on non-2xx responses
 */

import { authService } from './auth-service.js';

const BASE_URL = (import.meta.env.SERVER_API_BASE_URL as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await authService.getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try { errorBody = await response.json(); } catch { errorBody = null; }
    throw new ApiError(response.status, errorBody);
  }

  // 204 No Content
  if (response.status === 204) return undefined as unknown as T;

  // A 2xx that isn't JSON means the request didn't reach the API (e.g. the dev
  // proxy fell through and Vite served index.html). Surface it instead of
  // letting `response.json()` throw an opaque SyntaxError downstream.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      response.status,
      `Expected JSON from ${path} but received "${contentType || 'unknown'}". ` +
      `The request likely did not reach the API server.`,
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, body);
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, body);
  },
  delete<T>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },
};
