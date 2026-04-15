import debug from 'debug';

const log = debug('app:api');

const API_BASE = '/api/v1';

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
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, files }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chat failed: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

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
  const response = await fetch(`${API_BASE}/chat/autodebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Autodebug failed: ${response.status} - ${error}`);
  }
  return response.json();
}

export async function getModels(): Promise<ModelInfo[]> {
  const response = await fetch(`${API_BASE}/models`);
  if (!response.ok) throw new Error(`Failed to fetch models: ${response.status}`);
  return response.json();
}

export async function getApiKeys(): Promise<ApiKeyInfo[]> {
  const response = await fetch(`${API_BASE}/config/api-keys`);
  if (!response.ok) throw new Error(`Failed to fetch API keys: ${response.status}`);
  const data = await response.json();
  return data.providers;
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  const response = await fetch(`${API_BASE}/config/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
  if (!response.ok) throw new Error(`Failed to set API key: ${response.status}`);
}

export async function deleteApiKey(provider: string): Promise<void> {
  const response = await fetch(`${API_BASE}/config/api-keys/${provider}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete API key: ${response.status}`);
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error('Backend not available');
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
  const response = await fetch(`${API_BASE}/export/scad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const error = await response.text();
    log('export/scad failed: %s %s', response.status, error);
    throw new Error(`SCAD export failed: ${response.status} – ${error}`);
  }
  return response.json();
}
