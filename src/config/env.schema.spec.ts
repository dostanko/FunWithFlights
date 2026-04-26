import { validateEnv } from './env.schema';

const validBase = {
  PORT: '3000',
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  PROVIDERS: 'provider1,provider2',
  PROVIDER_PROVIDER1_URL: 'https://example.com/provider1',
  PROVIDER_PROVIDER2_URL: 'https://example.com/provider2',
  HTTP_TIMEOUT_MS: '5000',
};

describe('validateEnv', () => {
  it('accepts a complete, valid env and returns parsed values', () => {
    const out = validateEnv({ ...validBase });
    expect(out.PORT).toBe(3000);
    expect(out.HTTP_TIMEOUT_MS).toBe(5000);
    expect(out.NODE_ENV).toBe('test');
    expect(out.PROVIDERS).toBe('provider1,provider2');
    expect(out.PROVIDER_PROVIDER1_URL).toBe('https://example.com/provider1');
  });

  it('coerces PORT="3000" (string from env) to a number', () => {
    const out = validateEnv({ ...validBase, PORT: '3000' });
    expect(typeof out.PORT).toBe('number');
    expect(out.PORT).toBe(3000);
  });

  it('applies defaults when optional values are omitted', () => {
    const out = validateEnv({
      PROVIDERS: 'provider1',
      PROVIDER_PROVIDER1_URL: 'https://example.com/provider1',
    });
    expect(out.PORT).toBe(3000);
    expect(out.NODE_ENV).toBe('development');
    expect(out.LOG_LEVEL).toBe('info');
    expect(out.HTTP_TIMEOUT_MS).toBe(5000);
  });

  it('throws when PROVIDERS is empty', () => {
    expect(() => validateEnv({ ...validBase, PROVIDERS: '' })).toThrow(
      /PROVIDERS/,
    );
  });

  it('throws when PROVIDERS is whitespace only', () => {
    expect(() => validateEnv({ ...validBase, PROVIDERS: '   ' })).toThrow(
      /PROVIDERS/,
    );
  });

  it('throws when a PROVIDER_<NAME>_URL is missing for a name in PROVIDERS', () => {
    const env = {
      ...validBase,
      PROVIDERS: 'provider1,provider2,provider3',
    };
    expect(() => validateEnv(env)).toThrow(/PROVIDER_PROVIDER3_URL/);
  });

  it('throws when a PROVIDER_<NAME>_URL is not a valid URL', () => {
    const env = {
      ...validBase,
      PROVIDER_PROVIDER2_URL: 'not-a-url',
    };
    expect(() => validateEnv(env)).toThrow(/PROVIDER_PROVIDER2_URL/);
  });

  it('throws when PORT is not a positive integer', () => {
    expect(() => validateEnv({ ...validBase, PORT: '-1' })).toThrow();
    expect(() => validateEnv({ ...validBase, PORT: 'abc' })).toThrow();
  });

  it('throws when LOG_LEVEL is outside the allowed enum', () => {
    expect(() =>
      validateEnv({ ...validBase, LOG_LEVEL: 'verbose' }),
    ).toThrow();
  });

  it('lists every issue in a single multi-line error message', () => {
    expect(() =>
      validateEnv({
        PROVIDERS: 'provider1,provider2',
        PROVIDER_PROVIDER1_URL: 'not-a-url',
        // PROVIDER_PROVIDER2_URL deliberately missing
      }),
    ).toThrow(/PROVIDER_PROVIDER1_URL[\s\S]*PROVIDER_PROVIDER2_URL/);
  });
});
