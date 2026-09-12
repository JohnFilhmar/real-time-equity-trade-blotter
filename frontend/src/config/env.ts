import { z } from 'zod';

/**
 * The public environment, parsed once so a misconfigured deployment fails loudly at import rather
 * than as a failed fetch deep inside a hook.
 *
 * Next inlines `NEXT_PUBLIC_*` variables at build time, which is why each one is read by its full
 * literal name rather than through a loop over `process.env`.
 */
const env_schema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:5000'),
});

/**
 * Parses the public environment.
 *
 * @returns The validated variables.
 * @throws {Error} When a variable is present but malformed. The message names the variable and
 * never echoes its value.
 */
function load_env(): z.infer<typeof env_schema> {
  const parsed = env_schema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid public environment: ${problems}`);
  }

  return parsed.data;
}

const env = load_env();

/** Base URL of the trade API, used for HTTP and for the socket. No trailing slash. */
export const api_url: string = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
