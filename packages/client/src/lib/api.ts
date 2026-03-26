import ky, { HTTPError } from 'ky';
import type { ApiResponse, ApiError as ApiErrorBody } from '@ideathon/shared';

const API_URL = import.meta.env.PUBLIC_API_URL || '/api';

export const api = ky.create({
  prefixUrl: API_URL,
  throwHttpErrors: false,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
  },
});

export const juryApi = ky.create({
  prefixUrl: API_URL,
  throwHttpErrors: false,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('jury_token');
        if (token) {
          request.headers.set('X-Jury-Token', token);
        }
      },
    ],
  },
});

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    // Try to parse error body for structured error info
    if (contentType.includes('application/json')) {
      try {
        const body = await response.json();
        const err = (body as ApiErrorBody).error;
        throw new ApiError(
          err?.code || 'UNKNOWN_ERROR',
          err?.message || `HTTP ${response.status}`,
        );
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new ApiError('NETWORK_ERROR', `HTTP ${response.status}: ${response.statusText}`);
  }

  // Non-JSON success responses (binary downloads etc.) should not go through this path.
  // Callers must use apiBlob() or apiDownload() for such endpoints.
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      'UNEXPECTED_CONTENT_TYPE',
      `Expected JSON response but got ${contentType || 'unknown'}. Use apiBlob() for binary downloads.`,
    );
  }

  const body: ApiResponse<T> = await response.json();

  if (!body.success) {
    const err = (body as ApiErrorBody).error;
    throw new ApiError(
      err?.code || 'UNKNOWN_ERROR',
      err?.message || 'Request failed',
    );
  }

  return body.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await api.get(path);
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, json?: unknown): Promise<T> {
  const response = await api.post(path, { json });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, json?: unknown): Promise<T> {
  const response = await api.patch(path, { json });
  return handleResponse<T>(response);
}

export async function apiPut<T>(path: string, json?: unknown): Promise<T> {
  const response = await api.put(path, { json });
  return handleResponse<T>(response);
}

export async function apiDelete(path: string): Promise<void> {
  const response = await api.delete(path);
  if (response.status === 204) return;
  await handleResponse<void>(response);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await api.post(path, { body: formData });
  return handleResponse<T>(response);
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await api.get(path);
  if (!response.ok) {
    // Try to extract structured error from JSON error body
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await response.json();
        const err = (body as ApiErrorBody).error;
        throw new ApiError(err?.code || 'UNKNOWN_ERROR', err?.message || `HTTP ${response.status}`);
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new ApiError('NETWORK_ERROR', `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.blob();
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Defer cleanup so the browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export async function juryGet<T>(path: string): Promise<T> {
  const response = await juryApi.get(path);
  return handleResponse<T>(response);
}

export async function juryPut<T>(path: string, json?: unknown): Promise<T> {
  const response = await juryApi.put(path, { json });
  return handleResponse<T>(response);
}

export async function juryPost<T>(path: string, json?: unknown): Promise<T> {
  const response = await juryApi.post(path, { json });
  return handleResponse<T>(response);
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Re-export HTTPError for consumers that need to distinguish network vs API errors
export { HTTPError };
