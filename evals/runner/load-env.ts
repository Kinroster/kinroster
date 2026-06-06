// Vitest setupFile for the eval config. Loads ANTHROPIC_API_KEY (and any other
// keys) from .env.local into process.env for local runs, WITHOUT pulling in a
// dotenv dependency. Keys already present in the environment (e.g. CI secrets)
// are never overwritten. This file deliberately does NOT mock anything — the
// whole point of the eval harness is to hit the real API.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    // Keep an existing value only if it is non-empty. A defined-but-empty var
    // (common when a shell profile exports `ANTHROPIC_API_KEY=`) should not
    // shadow the real key in .env.local.
    if (!key || (process.env[key] ?? '').length > 0) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvLocal();

if (!process.env.ANTHROPIC_API_KEY) {
  // Not a failure — the eval specs skip themselves when the key is absent so a
  // keyless local run or fork PR exits 0. This banner explains the empty run.
  console.warn(
    '\n[evals] ANTHROPIC_API_KEY not set — eval specs will be skipped.\n' +
      '        Set it in .env.local or the environment to run live evals.\n'
  );
}
