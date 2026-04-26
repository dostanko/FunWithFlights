/**
 * Domain errors — thrown by adapters / services, caught by
 * `AppExceptionFilter` and translated into HTTP responses.
 *
 * Deliberately decoupled from HTTP: status codes live in the filter.
 * Domain code only expresses *what* went wrong; *how* we surface it
 * to the client is a transport detail.
 */

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProviderUnavailableError extends DomainError {
  constructor(
    public readonly providerName: string,
    cause?: unknown,
  ) {
    super(`Provider '${providerName}' is unavailable`, cause);
  }
}

export class ProviderTimeoutError extends DomainError {
  constructor(
    public readonly providerName: string,
    public readonly timeoutMs: number,
    cause?: unknown,
  ) {
    super(`Provider '${providerName}' timed out after ${timeoutMs}ms`, cause);
  }
}

export class ProviderParseError extends DomainError {
  constructor(
    public readonly providerName: string,
    cause?: unknown,
  ) {
    super(`Provider '${providerName}' returned a malformed response`, cause);
  }
}
