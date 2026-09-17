import express, { type Express, type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { attachUser } from "./middlewares/auth";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(attachUser);

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status =
    typeof error.status === "number" && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
  if (status === 500) {
    // The message and stack go to the log, never to the response: a 500 is
    // usually a bug, and diagnosing it from "code: INTERNAL_ERROR" alone is
    // not possible. The client still learns nothing about the internals.
    logger.error(
      {
        code: error.code ?? "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "API request failed",
    );
    res.status(500).json({ error: "Өгөгдөл уншихад алдаа гарлаа." });
    return;
  }
  res.status(status).json({ error: error.message, code: error.code ?? "ERROR" });
};
app.use(errorHandler);

export default app;
