export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
};

export type PaginationMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export type HealthResponse = {
  status: string;
  environment: string;
  timestamp: string;
};
