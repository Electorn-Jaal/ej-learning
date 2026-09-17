/** An error carrying the status the client should see. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "BAD_REQUEST") =>
  new HttpError(400, message, code);
export const unauthorized = (message: string, code = "UNAUTHORIZED") =>
  new HttpError(401, message, code);
export const forbidden = (message: string, code = "FORBIDDEN") =>
  new HttpError(403, message, code);
