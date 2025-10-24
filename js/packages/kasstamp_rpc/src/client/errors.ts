/**
 * Base error class for Kaspa RPC client errors
 */
export class KaspaRpcClientError extends Error {
  override name = 'KaspaRpcClientError';
  public override readonly cause?: Error;

  override toString(): string {
    return `${this.name}: ${this.message}`;
  }

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'KaspaRpcClientError';
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KaspaRpcClientError);
    }
  }
}

/**
 * Error class for connection-related failures
 */
export class KaspaConnectionError extends KaspaRpcClientError {
  override name = 'KaspaConnectionError';
}
