import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

const EXPECTED_PROVIDER_COUNT = 2;

function loadEnvFile(): Record<string, string> {
  const root = join(__dirname, '..', '..');
  const envPath = existsSync(join(root, '.env')) ? join(root, '.env') : join(root, '.env.example');
  return parse(readFileSync(envPath));
}

describe('Provider env configuration', () => {
  const env = loadEnvFile();
  const names = (env.PROVIDERS ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  it(`declares exactly ${EXPECTED_PROVIDER_COUNT} providers in PROVIDERS`, () => {
    expect(names).toHaveLength(EXPECTED_PROVIDER_COUNT);
  });

  it.each(names)('has PROVIDER_%s_URL defined', (name) => {
    const key = `PROVIDER_${name.toUpperCase()}_URL`;
    expect(env[key]).toBeDefined();
    expect(env[key]).not.toBe('');
  });
});
