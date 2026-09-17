import type { NextFunction, Request, RequestHandler, Response } from "express";
import { forbidden, unauthorized } from "../shared/http-error";
import {
  SESSION_COOKIE,
  resolve,
  type AuthenticatedUser,
  type UserRole,
} from "../modules/identity/service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Resolves the session cookie onto the request without rejecting anonymous
 * callers, so a route can serve both signed-in and public responses.
 */
export const attachUser: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token === "") {
    next();
    return;
  }
  resolve(token)
    .then((user) => {
      if (user) req.user = user;
      next();
    })
    .catch(next);
};

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(unauthorized("Нэвтэрнэ үү.", "NOT_AUTHENTICATED"));
    return;
  }
  next();
}

/** Any one of the listed roles is enough. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(unauthorized("Нэвтэрнэ үү.", "NOT_AUTHENTICATED"));
      return;
    }
    if (!roles.some((role) => req.user!.roles.includes(role))) {
      next(forbidden("Энэ үйлдэлд эрх хүрэхгүй байна.", "ROLE_REQUIRED"));
      return;
    }
    next();
  };
}
