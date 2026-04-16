import debug from 'debug';
import i18n from 'i18next';

const log = debug('app:api');

const API_BASE = '/api/v1';

const MAX_ERROR_BODY_CHARS = 280;

function squishErrorBody(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > MAX_ERROR_BODY_CHARS ? `${s.slice(0, MAX_ERROR_BODY_CHARS)}…` : s;
}

async function readErrorBody(response: Response): Promise<string> {
  return squishErrorBody(await response.text().catch(() => ''));
}

function formatDetail(body: string): string {
  return body ? i18n.t('api.detailPrefix', { body }) : '';
}

/**
 * `fetch` wrapper: turns connection failures into a clear message (browser often only says "Failed to fetch").
 */
async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw e;
    }
    const hint = i18n.t('api.backendSetupHint');
    throw new Error(i18n.t('api.errors.noConnection', { hint }));
  }
}

/** Throws `Error` with a translated message for the UI. `resourceKey` e.g. `api.resources.models`. */
async function throwUnlessOk(response: Response, resourceKey: string): Promise<void> {
  if (response.ok) return;
  const body = await readErrorBody(response);
  const resource = i18n.t(resourceKey);
  const hint = i18n.t('api.backendSetupHint');
  const detail = formatDetail(body);
  const { status, statusText } = response;

  if (status === 502 || status === 503 || status === 504) {
    throw new Error(
      i18n.t('api.errors.badGateway', { resource, status, statusText, detail, hint }),
    );
  }
  if (status === 401 || status === 403) {
    throw new Error(i18n.t('api.errors.forbidden', { resource, status, detail }));
  }
  if (status >= 500) {
    throw new Error(i18n.t('api.errors.server', { resource, status, detail }));
  }
  if (status === 404) {
    throw new Error(i18n.t('api.errors.notFound', { resource, detail }));
  }
  throw new Error(i18n.t('api.errors.generic', { resource, status, detail }));
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface UploadedFile {
  name: string;
  content_type: string;
  data_base64: string;
}

export interface StreamEvent {
  token?: string;
  done: boolean;
  full_response?: string;
  code?: string;
  /** Present when the backend reports an LLM or provider failure (still with done: true). */
  error?: string;
}

export interface AutodebugRequest {
  code: string;
  errors: string;
  model: string;
  attempt: number;
}

export interface AutodebugResponse {
  fixed_code: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  supports_vision: boolean;
  license_info: string;
  pricing_tier: string;
  is_local: boolean;
}

export interface ApiKeyInfo {
  provider: string;
  masked_key: string;
  configured: boolean;
}

export async function* streamChat(
  messages: ChatMessage[],
  model: string,
  files?: UploadedFile[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const response = await fetchApi(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, files }),
    signal,
  });

  await throwUnlessOk(response, 'api.resources.chatStream');

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(i18n.t('api.errors.emptyStreamBody'));
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          yield event;
        } catch {
          log('Skipping invalid SSE JSON: %s', line);
        }
      }
    }
  }
}

export async function autodebug(req: AutodebugRequest): Promise<AutodebugResponse> {
  const response = await fetchApi(`${API_BASE}/chat/autodebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  await throwUnlessOk(response, 'api.resources.autodebug');
  return response.json();
}

export async function getModels(): Promise<ModelInfo[]> {
  const response = await fetchApi(`${API_BASE}/models`);
  await throwUnlessOk(response, 'api.resources.models');
  return response.json();
}

export async function getApiKeys(): Promise<ApiKeyInfo[]> {
  const response = await fetchApi(`${API_BASE}/config/api-keys`);
  await throwUnlessOk(response, 'api.resources.apiKeys');
  const data = await response.json();
  return data.providers;
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  const response = await fetchApi(`${API_BASE}/config/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
  await throwUnlessOk(response, 'api.resources.apiKeysSave');
}

export async function deleteApiKey(provider: string): Promise<void> {
  const response = await fetchApi(`${API_BASE}/config/api-keys/${provider}`, {
    method: 'DELETE',
  });
  await throwUnlessOk(response, 'api.resources.apiKeysDelete');
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  const response = await fetchApi(`${API_BASE}/health`);
  await throwUnlessOk(response, 'api.resources.health');
  return response.json();
}

export interface ExportScadRequest {
  code: string;
  optimize_for_freecad: boolean;
}

export interface ExportScadResponse {
  code: string;
  filename: string;
}

export async function exportScad(req: ExportScadRequest): Promise<ExportScadResponse> {
  const response = await fetchApi(`${API_BASE}/export/scad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    log('export/scad failed: HTTP %s', response.status);
  }
  await throwUnlessOk(response, 'api.resources.scadExport');
  return response.json();
}
