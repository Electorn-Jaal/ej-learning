import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
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

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) logger.error({code:error.code ?? 'INTERNAL_ERROR'}, 'API request failed');
  res.status(status).json({error:status === 500 ? 'Өгөгдөл уншихад алдаа гарлаа.' : error.message});
};
app.use(errorHandler);

export default app;
