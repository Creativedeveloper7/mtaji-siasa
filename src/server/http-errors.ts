/**
 * Turns an error thrown by a repository into an API failure.
 *
 * Every Tracker repository error class (LeaderStoreError, ProjectAccessError,
 * ProjectInputError, ProjectConflictError, TrackerWriteError,
 * ContentWriteError, ImageUploadError, ...) carries a numeric HTTP `status`.
 * 4xx messages are written for people and are passed through. Anything else
 * (5xx, or an error without a status: usually a raw database message) is
 * logged on the server and answered with a generic message, so table names,
 * constraint names and SQL never reach the browser.
 */
export type ErrorFailure = { ok: false; status: number; error: string };

const GENERIC: Record<number, string> = {
  500: "Something went wrong. Try again in a moment.",
  501: "This is not available yet.",
  502: "The Tracker backend did not answer. Try again in a moment.",
  503: "This is not available right now. Try again in a moment.",
};

export function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
}

/** Messages a 5xx repository error may show as is: written for people, no database detail. */
const SAFE_5XX = [
  /^These fields cannot be saved until /,
  /^Shortlisting cannot be saved until /,
  /^Gallery photos and video links need a Tracker update/,
  /^Saving opportunities needs Tracker migration/,
  /^Voting is not available yet\.$/,
];

/** Text that comes from Postgres / PostgREST rather than from Siasa. */
const DATABASE_TEXT =
  /violates|constraint|relation "|column "|row-level security|permission denied|PGRST|syntax error|duplicate key|invalid input syntax|null value in/i;

const GENERIC_4XX: Record<number, string> = {
  400: "The Tracker did not accept one of the values. Check the form and try again.",
  401: "Sign in required.",
  403: "You are not allowed to do this.",
  404: "Not found.",
  409: "This record already exists or was changed elsewhere. Reload and try again.",
};

export function failureFromError(error: unknown, context = "request"): ErrorFailure {
  const status = errorStatus(error) ?? 500;
  const message = error instanceof Error ? error.message : "";
  if (status < 500 && message) {
    if (!DATABASE_TEXT.test(message)) return { ok: false, status, error: message };
    console.warn(`[api] ${context}: ${message}`);
    return { ok: false, status, error: GENERIC_4XX[status] ?? GENERIC_4XX[400] };
  }
  if (message && SAFE_5XX.some((pattern) => pattern.test(message))) return { ok: false, status, error: message };
  console.error(`[api] ${context} failed`, error);
  return { ok: false, status, error: GENERIC[status] ?? GENERIC[500] };
}
