import { Router, type IRouter } from "express";
import identityRouter from "../modules/identity/routes";
import learningRouter from "../modules/learning/routes";
import nativeLearningRouter from "./native-learning";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(identityRouter);
router.use(learningRouter);
router.use(nativeLearningRouter);

export default router;
