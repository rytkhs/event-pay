import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STALE_LOCK_MS = 10 * 60 * 1000;
const LOCK_RETRY_MS = 250;

export async function acquireStripeConnectSharedAccountLock(
  name: string,
  timeoutMs = 120_000
): Promise<() => Promise<void>> {
  const lockDir = join(tmpdir(), `event-pay-${name}.lock`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await mkdir(lockDir);
      return async () => {
        await rm(lockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      await removeStaleLock(lockDir);
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  throw new Error(`Timed out waiting for Stripe Connect shared account lock: ${name}`);
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

async function removeStaleLock(lockDir: string): Promise<void> {
  try {
    const stats = await stat(lockDir);
    if (Date.now() - stats.mtimeMs > STALE_LOCK_MS) {
      await rm(lockDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
