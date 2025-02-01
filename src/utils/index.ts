import { exec } from 'child_process';
import { event, wait } from './log';

export * from './log';
export * from './picocolors';

export function validateProjectName(value: string): string | boolean {
  if (!value) return 'Project name cannot be empty';
  return /^[a-z0-9-]+$/.test(value)
    ? true
    : 'Project name can only contain lowercase letters, numbers, and hyphens';
}

export function pingVersion(cmd: string) {
  return new Promise<boolean>((resolve) => {
    exec(`${cmd} --version`, (error) => {
      resolve(!error);
    });
  });
}

export async function runPromiseStep<T>(fn: () => Promise<T>, message: string) {
  const time = Date.now();
  wait(message);
  await fn();
  event(`Done in ${Date.now() - time}ms\n`);
}
