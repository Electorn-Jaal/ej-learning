import { Router, type IRouter } from "express";
import ejLearningRouter from "./native-learning";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ejLearningRouter);

export default router;
