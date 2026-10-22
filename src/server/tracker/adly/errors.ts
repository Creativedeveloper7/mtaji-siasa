/**
 * An error whose message is safe to show the user, with the HTTP status to
 * answer with. Anything else thrown inside the Adly service is logged and
 * answered with a generic message (raw Postgres / provider text never reaches
 * the client).
 */
export class AdlyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AdlyError";
  }
}

export const CHANGED_MESSAGE = "This campaign changed — reload and try again.";
export const PUBLISHING_MESSAGE = "Publishing already in progress for this campaign. Wait a moment and reload.";
