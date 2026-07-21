import { resolve } from 'node:path';
import dotenv from 'dotenv';

const frontendRoot = resolve(import.meta.dirname, '../..');

dotenv.config({ path: resolve(frontendRoot, '../backend/.env'), quiet: true });
dotenv.config({ path: resolve(frontendRoot, '.env.e2e.local'), override: true, quiet: true });

export const E2E_BASE_URL = process.env.E2E_BASE_URL?.trim() || '';
export const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

export function requireE2eEnvironment() {
  const missing = [
    ['E2E_BASE_URL', E2E_BASE_URL],
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_PUBLISHABLE_KEY', SUPABASE_PUBLISHABLE_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing end-to-end environment variables: ${missing.join(', ')}. Copy .env.e2e.example to .env.e2e.local and add the test project credentials.`);
  }

  const baseUrl = new URL(E2E_BASE_URL);
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('E2E_BASE_URL must use http or https.');
  }
}
