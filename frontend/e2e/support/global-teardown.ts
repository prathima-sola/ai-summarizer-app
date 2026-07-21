import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  requireE2eEnvironment,
} from './environment';
import { AUTH_STATE_PATH, readRunState } from './run-state';

async function removeUserFiles(admin: ReturnType<typeof createClient>, userId: string) {
  const paths = new Set<string>();
  const { data: documents } = await admin.from('documents').select('storage_path').eq('user_id', userId);
  documents?.forEach((document) => paths.add(document.storage_path));

  const { data: folders } = await admin.storage.from('documents').list(userId, { limit: 1_000 });
  for (const folder of folders || []) {
    const { data: files } = await admin.storage.from('documents').list(`${userId}/${folder.name}`, { limit: 1_000 });
    files?.forEach((file) => paths.add(`${userId}/${folder.name}/${file.name}`));
  }

  if (paths.size) {
    const { error } = await admin.storage.from('documents').remove([...paths]);
    if (error) throw new Error(`Could not remove E2E files: ${error.message}`);
  }
}

export default async function globalTeardown() {
  requireE2eEnvironment();
  const runState = await readRunState();
  if (!runState) return;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await removeUserFiles(admin, runState.userId);
    const { error: documentError } = await admin.from('documents').delete().eq('user_id', runState.userId);
    if (documentError) throw new Error(`Could not remove E2E documents: ${documentError.message}`);
    const { error: userError } = await admin.auth.admin.deleteUser(runState.userId);
    if (userError) throw new Error(`Could not remove the temporary E2E user: ${userError.message}`);
  } finally {
    await rm(dirname(AUTH_STATE_PATH), { recursive: true, force: true });
  }
}
