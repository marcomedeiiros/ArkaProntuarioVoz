import { Router } from "express";
import { auth } from "../middleware/auth";
import { getDashboard } from "../use-cases/dashboard";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res) => {
  res.json(await getDashboard(auth(req)));
});
