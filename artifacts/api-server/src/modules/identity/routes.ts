import { Router, type IRouter } from "express";
import {
  GetSessionResponse,
  LoginBody,
  LoginResponse,
} from "@workspace/api-zod";
import { badRequest } from "../../shared/http-error";
import { requireAuth } from "../../middlewares/auth";
import { SESSION_COOKIE, login, logout } from "./service";

const router: IRouter = Router();

const isProduction = () => process.env.NODE_ENV === "production";

const cookieOptions = (expiresAt?: Date) => ({
  httpOnly: true,
  // Lax still sends the cookie on top-level navigation, which is what a
  // school portal needs, while blocking cross-site form posts.
  sameSite: "lax" as const,
  secure: isProduction(),
  path: "/",
  ...(expiresAt ? { expires: expiresAt } : {}),
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Нэвтрэх нэр, нууц үгээ оруулна уу.", "MISSING_FIELDS");
    }

    const session = await login(parsed.data.username.trim(), parsed.data.password);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    res.json(LoginResponse.parse({ user: session.user }));
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") await logout(token);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json(GetSessionResponse.parse({ user: req.user }));
});

export default router;
