import { NextFunction, Request, Response } from 'express';

/**
 * Error carrying an HTTP status and a machine-readable code, so a service can
 * signal a specific failure that {@link errorHandler} renders in the project's
 * `{ error: { code, message } }` envelope.
 */
export class ApiError extends Error {
  status: number;
  code: string;

  /**
   * @param status - HTTP status code to respond with.
   * @param code - Machine-readable error code for the response envelope.
   * @param message - Human-readable message.
   */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Wrap an async route handler so a rejected promise is forwarded to Express's
 * error pipeline via `next(err)` instead of becoming an unhandled rejection.
 *
 * @param fn - The async route handler to wrap.
 * @returns An Express handler that runs `fn` and routes any rejection to `next`.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Terminal Express error middleware. Renders an {@link ApiError} with its own
 * status and code; logs anything else and responds with a generic 500. All
 * replies use the project's `{ error: { code, message } }` envelope.
 *
 * @param err - The error thrown or forwarded from upstream handlers.
 * @param _req - The request (unused).
 * @param res - The response used to send the error envelope.
 * @param _next - Express next (unused; this is the terminal handler).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error('[error] unhandled:', err);
  res
    .status(500)
    .json({ error: { code: 'internal_error', message: 'Internal server error' } });
}
