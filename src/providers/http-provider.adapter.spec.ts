import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import nock from 'nock';
import { HttpProviderAdapter } from './http-provider.adapter';
import {
  ProviderParseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../common/errors/domain.errors';

const BASE_URL = 'https://provider1.example.com';
const PATH = '/routes';

function makeAdapter(timeoutMs = 200) {
  // `proxy: false` is essential here — many CI / sandbox environments set
  // HTTP(S)_PROXY, and axios honours those by default. Without this, the
  // request goes to the proxy address (e.g. localhost:3128) instead of
  // through nock's interceptor, and every test fails as a network error.
  const http = new HttpService(axios.create({ proxy: false }));
  return new HttpProviderAdapter('provider1', `${BASE_URL}${PATH}`, timeoutMs, http);
}

describe('HttpProviderAdapter', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('happy path', () => {
    it('returns the parsed JSON object body unchanged on 200', async () => {
      nock(BASE_URL)
        .get(PATH)
        .reply(200, { hello: 'world' }, { 'content-type': 'application/json' });

      const adapter = makeAdapter();
      const body = await adapter.fetch();

      expect(body).toEqual({ hello: 'world' });
    });

    it('returns the parsed JSON array body unchanged on 200', async () => {
      const payload = [{ id: 1 }, { id: 2 }];
      nock(BASE_URL)
        .get(PATH)
        .reply(200, payload, { 'content-type': 'application/json' });

      const adapter = makeAdapter();
      const body = await adapter.fetch();

      expect(body).toEqual(payload);
    });
  });

  describe('timeout', () => {
    it('throws ProviderTimeoutError when the request exceeds timeoutMs', async () => {
      nock(BASE_URL).get(PATH).delay(500).reply(200, { ok: true });

      const adapter = makeAdapter(50);
      const err = await adapter.fetch().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ProviderTimeoutError);
      expect((err as ProviderTimeoutError).providerName).toBe('provider1');
      expect((err as ProviderTimeoutError).timeoutMs).toBe(50);
      expect((err as Error).message).toContain('50ms');
    });
  });

  describe('upstream HTTP errors', () => {
    it('throws ProviderUnavailableError on 503', async () => {
      nock(BASE_URL).get(PATH).reply(503, 'service unavailable');

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('throws ProviderUnavailableError on 500', async () => {
      nock(BASE_URL).get(PATH).reply(500, 'internal');

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('throws ProviderUnavailableError on 404 (4xx surfaced as 502, not passthrough)', async () => {
      nock(BASE_URL).get(PATH).reply(404, 'not found');

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('preserves providerName on the thrown error', async () => {
      nock(BASE_URL).get(PATH).reply(503);

      const adapter = makeAdapter();
      try {
        await adapter.fetch();
        fail('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderUnavailableError);
        if (e instanceof ProviderUnavailableError) {
          expect(e.providerName).toBe('provider1');
        }
      }
    });
  });

  describe('network errors', () => {
    it('throws ProviderUnavailableError on ECONNREFUSED', async () => {
      nock(BASE_URL)
        .get(PATH)
        .replyWithError({ code: 'ECONNREFUSED', message: 'connect refused' });

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('throws ProviderUnavailableError on ENOTFOUND (DNS)', async () => {
      nock(BASE_URL)
        .get(PATH)
        .replyWithError({ code: 'ENOTFOUND', message: 'dns lookup failed' });

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('throws ProviderUnavailableError on ECONNRESET', async () => {
      nock(BASE_URL)
        .get(PATH)
        .replyWithError({ code: 'ECONNRESET', message: 'connection reset' });

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });
  });

  describe('parse errors', () => {
    it('throws ProviderParseError when body is not valid JSON', async () => {
      nock(BASE_URL)
        .get(PATH)
        .reply(200, 'not-json-at-all', { 'content-type': 'application/json' });

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(ProviderParseError);
    });

    it('throws ProviderParseError when body parses to JSON null', async () => {
      nock(BASE_URL)
        .get(PATH)
        .reply(200, 'null', { 'content-type': 'application/json' });

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(ProviderParseError);
    });

    it('throws ProviderParseError when body parses to a primitive (string)', async () => {
      nock(BASE_URL)
        .get(PATH)
        .reply(200, '"hello"', { 'content-type': 'application/json' });

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(ProviderParseError);
    });

    it('throws ProviderParseError when body parses to a primitive (number)', async () => {
      nock(BASE_URL)
        .get(PATH)
        .reply(200, '42', { 'content-type': 'application/json' });

      const adapter = makeAdapter();
      await expect(adapter.fetch()).rejects.toBeInstanceOf(ProviderParseError);
    });
  });
});
