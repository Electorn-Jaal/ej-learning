import { Router, type IRouter } from "express";
import { GetCurrentTermResponse, GetSchoolPeriodsResponse } from "@workspace/api-zod";
import { requireAuth } from "../../middlewares/auth";
import { currentTerm, schoolPeriods } from "./service";

const router: IRouter = Router();

// Any signed-in account: the term is what the whole school is in, and every
// screen that names a date sits inside it.
router.get("/term/current", requireAuth, async (_req, res, next) => {
  try {
    res.json(GetCurrentTermResponse.parse(await currentTerm()));
  } catch (error) {
    next(error);
  }
});

// Bell times are the shape of everyone's day, so any signed-in account reads
// them - the same rule as the term above.
router.get("/school/periods", requireAuth, async (_req, res, next) => {
  try {
    res.json(GetSchoolPeriodsResponse.parse(await schoolPeriods()));
  } catch (error) {
    next(error);
  }
});

export default router;
