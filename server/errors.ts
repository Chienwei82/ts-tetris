import type { ApiErrorBody } from '../src/leaderboard/types.js';

/** Error de API con código estable: el handler lo traduce a HTTP + JSON. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }

  toBody(): ApiErrorBody {
    return this.field === undefined
      ? { error: this.code, message: this.message }
      : { error: this.code, message: this.message, field: this.field };
  }
}
