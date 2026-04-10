import { createLogger } from '@/lib/logger';
import type { DifyConfig } from '@/lib/server/publish/dify-config';

const log = createLogger('DifyClient');

export interface DifyMetadataField {
  id: string;
  name: string;
  type: string;
  count?: number;
}

export interface DifyIndexingStatusEntry {
  id: string;
  indexing_status: string;
  error: string | null;
  completed_segments?: number;
  total_segments?: number;
}

export class DifyApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'DifyApiError';
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
}

interface DifyDocumentPayload {
  id: string;
  name?: string;
  created_at?: number;
  indexing_status?: string;
  archived?: boolean;
}

interface DifyDocumentMutationResponse {
  document: DifyDocumentPayload;
  batch: string;
}

function buildUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

async function readErrorPayload(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
    return JSON.stringify(payload);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText;
    }
  }
}

export class DifyClient {
  constructor(private readonly config: DifyConfig) {}

  private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const url = buildUrl(this.config.baseUrl, pathname);

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readErrorPayload(response);
        throw new DifyApiError(response.status, message);
      }

      return (await response.json()) as T;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new DifyApiError(408, 'Dify request timed out', 'TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getDocument(documentId: string) {
    return this.request<Record<string, unknown>>(
      `/datasets/${this.config.datasetId}/documents/${documentId}`,
    );
  }

  async createDocumentByText(input: {
    name: string;
    text: string;
    separator: string;
    docLanguage?: string;
  }): Promise<{ documentId: string; documentName: string; createdAt: string | null; batch: string }> {
    const payload = await this.request<DifyDocumentMutationResponse>(
      `/datasets/${this.config.datasetId}/document/create-by-text`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          text: input.text,
          doc_form: 'text_model',
          ...(input.docLanguage ? { doc_language: input.docLanguage } : {}),
          process_rule: {
            mode: 'custom',
            rules: {
              pre_processing_rules: [],
              segmentation: {
                separator: input.separator,
                max_tokens: 4000,
                chunk_overlap: 0,
              },
            },
          },
        }),
      },
    );

    return {
      documentId: payload.document.id,
      documentName: payload.document.name || input.name,
      createdAt: payload.document.created_at
        ? new Date(payload.document.created_at * 1000).toISOString()
        : null,
      batch: payload.batch,
    };
  }

  async updateDocumentByText(input: {
    documentId: string;
    name?: string;
    text: string;
    separator: string;
    docLanguage?: string;
  }): Promise<{ documentId: string; documentName: string; createdAt: string | null; batch: string }> {
    const payload = await this.request<DifyDocumentMutationResponse>(
      `/datasets/${this.config.datasetId}/documents/${input.documentId}/update-by-text`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          text: input.text,
          doc_form: 'text_model',
          ...(input.docLanguage ? { doc_language: input.docLanguage } : {}),
          process_rule: {
            mode: 'custom',
            rules: {
              pre_processing_rules: [],
              segmentation: {
                separator: input.separator,
                max_tokens: 4000,
                chunk_overlap: 0,
              },
            },
          },
        }),
      },
    );

    return {
      documentId: payload.document.id,
      documentName: payload.document.name || input.name || payload.document.id,
      createdAt: payload.document.created_at
        ? new Date(payload.document.created_at * 1000).toISOString()
        : null,
      batch: payload.batch,
    };
  }

  async getDocumentIndexingStatus(batch: string): Promise<DifyIndexingStatusEntry[]> {
    const payload = await this.request<{ data?: DifyIndexingStatusEntry[] }>(
      `/datasets/${this.config.datasetId}/documents/${batch}/indexing-status`,
    );
    return payload.data || [];
  }

  async listMetadataFields(): Promise<DifyMetadataField[]> {
    const payload = await this.request<{ doc_metadata?: DifyMetadataField[] }>(
      `/datasets/${this.config.datasetId}/metadata`,
    );
    return payload.doc_metadata || [];
  }

  async createMetadataField(name: string): Promise<DifyMetadataField> {
    return this.request<DifyMetadataField>(`/datasets/${this.config.datasetId}/metadata`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 'string',
      }),
    });
  }

  async updateDocumentMetadata(input: {
    documentId: string;
    metadataList: Array<{ id: string; name: string; value: string }>;
  }) {
    await this.request<{ result: string }>(`/datasets/${this.config.datasetId}/documents/metadata`, {
      method: 'POST',
      body: JSON.stringify({
        operation_data: [
          {
            document_id: input.documentId,
            metadata_list: input.metadataList,
          },
        ],
      }),
    });

    log.info('Updated Dify document metadata', {
      datasetId: this.config.datasetId,
      documentId: input.documentId,
      metadataKeys: input.metadataList.map((item) => item.name),
    });
  }
}
