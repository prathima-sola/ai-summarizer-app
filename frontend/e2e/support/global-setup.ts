import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { FullConfig } from '@playwright/test';
import {
  E2E_BASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  requireE2eEnvironment,
} from './environment';
import { AUTH_STATE_PATH, RUN_STATE_PATH, writeJson } from './run-state';

export default async function globalSetup(_config: FullConfig) {
  requireE2eEnvironment();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `briefly-e2e-${randomUUID()}@example.invalid`;
  const password = randomBytes(30).toString('base64url');
  let userId = '';

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: 'automated-e2e' },
    });
    if (createError || !created.user) throw new Error(`Could not create the temporary E2E user: ${createError?.message || 'unknown error'}`);
    userId = created.user.id;

    const browserClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signedIn, error: signInError } = await browserClient.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) throw new Error(`Could not authenticate the temporary E2E user: ${signInError?.message || 'unknown error'}`);

    const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
    await writeJson(AUTH_STATE_PATH, {
      cookies: [],
      origins: [{
        origin: new URL(E2E_BASE_URL).origin,
        localStorage: [{
          name: `sb-${projectRef}-auth-token`,
          value: JSON.stringify(signedIn.session),
        }],
      }],
    });
    await writeJson(RUN_STATE_PATH, { userId });
  } catch (error) {
    if (userId) await admin.auth.admin.deleteUser(userId);
    throw error;
  }
}
