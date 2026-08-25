export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(
    message: string,
    status = 500,
    options?: { cause?: Error; details?: unknown }
  ) {
    super(message);
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
    this.status = status;
    this.details = options?.details;
  }
}
