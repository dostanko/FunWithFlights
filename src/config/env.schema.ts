import { z } from 'zod';

/**
 * Single source of truth for the runtime environment shape.
 *
 * - All values are validated at boot. The process exits non-zero on any
 *   issue, so we fail loudly during container startup instead of
 *   crashing on the first request that hits a missing key.
 * - `PROVIDER_<NAME>_URL` is dynamic (one per name in `PROVIDERS`), so
 *   it's enforced via `superRefine` rather than a static field.
 * - `passthrough()` keeps unknown keys (including the dynamic provider
 *   URL keys) on the parsed object so `ConfigService` can still hand
 *   them out.
 */

const NodeEnv = z.enum(['development', 'production', 'test']);
const LogLevel = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

const baseSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: NodeEnv.default('development'),
    LOG_LEVEL: LogLevel.default('info'),
    PROVIDERS: z
      .string({ required_error: 'PROVIDERS is required' })
      .refine((s) => s.trim().length > 0, {
        message: 'PROVIDERS must not be empty',
      })
      .refine(
        (s) =>
          s
            .split(',')
            .map((n) => n.trim())
            .every((n) => n.length > 0),
        { message: 'PROVIDERS must not contain empty entries' },
      ),
    HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    // Fire-and-forget warm-up fetch on startup. Defaults to true so a
    // freshly-deployed task pre-warms upstream Lambdas before the first
    // real request lands. Set to `false` in tests to avoid network noise.
    PROVIDERS_WARMUP: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : v)),
  })
  .passthrough();

export const EnvSchema = baseSchema.superRefine((env, ctx) => {
  // PROVIDERS is guaranteed to be a non-empty CSV at this point.
  const names = env.PROVIDERS.split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  for (const name of names) {
    const key = `PROVIDER_${name.toUpperCase()}_URL`;
    const raw = (env as Record<string, unknown>)[key];

    if (raw === undefined || raw === null || raw === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required (declared in PROVIDERS)`,
      });
      continue;
    }

    if (typeof raw !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be a string`,
      });
      continue;
    }

    try {
      // eslint-disable-next-line no-new
      new URL(raw);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `must be a valid URL, got '${raw}'`,
      });
    }
  }
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Function passed to `ConfigModule.forRoot({ validate })`. On failure
 * throws a single Error with a multi-line message listing every issue —
 * Nest prints it and exits before the HTTP listener binds.
 */
export function validateEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const result = EnvSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  const lines = result.error.issues.map((i) => {
    const path = i.path.length > 0 ? i.path.join('.') : '(root)';
    return `  - ${path}: ${i.message}`;
  });
  throw new Error(['Invalid environment configuration:', ...lines].join('\n'));
}
