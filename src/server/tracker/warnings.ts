import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Repository warnings (data a write had to leave out because a Tracker
 * migration is not applied yet) for the request that caused them. Each
 * warning is also logged on the server.
 */
const collector = new AsyncLocalStorage<string[]>();

export function reportWarning(message: string): void {
  console.warn(message);
  const list = collector.getStore();
  if (list && !list.includes(message)) list.push(message);
}

/** Runs `task` and returns the warnings repositories reported while it ran. */
export async function collectWarnings<T>(task: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const result = await collector.run(warnings, task);
  return { result, warnings };
}
