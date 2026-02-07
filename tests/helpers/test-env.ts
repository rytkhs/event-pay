type MutableEnv = Record<string, string | undefined>;

function mutableEnv(): MutableEnv {
  return process.env as MutableEnv;
}

export function setTestEnv(key: string, value: string): void {
  mutableEnv()[key] = value;
}

export function unsetTestEnv(key: string): void {
  delete mutableEnv()[key];
}

export async function withTestEnv<T>(
  overrides: Record<string, string | undefined>,
  action: () => Promise<T> | T
): Promise<T> {
  const env = mutableEnv();
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = env[key];
    const next = overrides[key];
    if (next === undefined) {
      delete env[key];
    } else {
      env[key] = next;
    }
  }

  try {
    return await action();
  } finally {
    for (const key of Object.keys(overrides)) {
      const prev = original[key];
      if (prev === undefined) {
        delete env[key];
      } else {
        env[key] = prev;
      }
    }
  }
}
