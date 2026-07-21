import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const AUTH_STATE_PATH = resolve(import.meta.dirname, '../../.playwright/auth-state.json');
export const RUN_STATE_PATH = resolve(import.meta.dirname, '../../.playwright/run-state.json');

export type RunState = {
  userId: string;
};

export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export async function readRunState(): Promise<RunState | null> {
  try {
    return JSON.parse(await readFile(RUN_STATE_PATH, 'utf8')) as RunState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
