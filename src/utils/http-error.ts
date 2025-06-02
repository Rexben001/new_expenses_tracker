export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 500, options?: { cause?: Error }) {
    super(message);
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
    this.status = status;
  }
}
