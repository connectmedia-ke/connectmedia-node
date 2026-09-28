export declare const DEFAULT_BASE_URL: string;

export interface ApiEnvelope {
  code: string;
  message: string;
  data?: Record<string, unknown>;
  api_version?: string;
}

export declare class ConnectMediaError extends Error {
  code: string;
  apiMessage: string;
  response: Partial<ApiEnvelope>;
}

export interface ClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export declare function normalizeMsisdn(number: string): string;

export declare class Client {
  constructor(apiKey: string, options?: ClientOptions);
  send(to: string | string[], message: string, options?: { sender?: string; scheduleAt?: Date }): Promise<ApiEnvelope>;
  balance(): Promise<ApiEnvelope>;
  history(options?: { limit?: number; offset?: number; startDate?: string; endDate?: string }): Promise<ApiEnvelope>;
  inbox(options?: { limit?: number }): Promise<ApiEnvelope>;
}
