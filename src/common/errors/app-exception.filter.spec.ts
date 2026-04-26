import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AppExceptionFilter } from './app-exception.filter';
import {
  ProviderParseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './domain.errors';

interface MockRes {
  status: jest.Mock;
  json: jest.Mock;
  body?: unknown;
  statusCode?: number;
}

function makeHost(reqId = 'req-test-1'): {
  host: ArgumentsHost;
  res: MockRes;
} {
  const res: MockRes = {
    status: jest.fn().mockImplementation(function (this: MockRes, s: number) {
      this.statusCode = s;
      return this;
    }),
    json: jest.fn().mockImplementation(function (this: MockRes, body: unknown) {
      this.body = body;
      return this;
    }),
  };
  // `status` and `json` need `this` bound to `res`.
  res.status = res.status.bind(res);
  res.json = res.json.bind(res);

  const req = { id: reqId };
  const host: Partial<ArgumentsHost> = {
    switchToHttp: () =>
      ({
        getResponse: <T>() => res as unknown as T,
        getRequest: <T>() => req as unknown as T,
        getNext: <T>() => undefined as unknown as T,
      }) as ReturnType<ArgumentsHost['switchToHttp']>,
  };
  return { host: host as ArgumentsHost, res };
}

describe('AppExceptionFilter', () => {
  let filter: AppExceptionFilter;

  beforeEach(() => {
    filter = new AppExceptionFilter();
    // Silence the error/warn logs the filter emits during these tests.
    jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn((filter as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  it('maps ProviderTimeoutError → 504 PROVIDER_TIMEOUT', () => {
    const { host, res } = makeHost();
    filter.catch(new ProviderTimeoutError('provider1', 5000), host);
    expect(res.statusCode).toBe(504);
    expect(res.body).toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      requestId: 'req-test-1',
    });
  });

  it('maps ProviderUnavailableError → 502 PROVIDER_UNAVAILABLE', () => {
    const { host, res } = makeHost();
    filter.catch(new ProviderUnavailableError('provider1'), host);
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('maps ProviderParseError → 502 PROVIDER_PARSE_ERROR', () => {
    const { host, res } = makeHost();
    filter.catch(new ProviderParseError('provider1'), host);
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ code: 'PROVIDER_PARSE_ERROR' });
  });

  it('maps generic Error → 500 INTERNAL_ERROR', () => {
    const { host, res } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('maps HttpException → its own status with HTTP_<status> code', () => {
    const { host, res } = makeHost();
    filter.catch(
      new HttpException('Not Found', HttpStatus.NOT_FOUND),
      host,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      code: 'HTTP_404',
      message: 'Not Found',
    });
  });

  it('always returns a body of shape { code, message, requestId, timestamp }', () => {
    const { host, res } = makeHost();
    filter.catch(new Error('boom'), host);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('requestId', 'req-test-1');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('string');
    // ISO-8601: at minimum starts with YYYY-MM-DD.
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes the requestId from req.id on the response body', () => {
    const { host, res } = makeHost('custom-req-id-42');
    filter.catch(new Error('boom'), host);
    expect((res.body as { requestId: string }).requestId).toBe(
      'custom-req-id-42',
    );
  });
});
