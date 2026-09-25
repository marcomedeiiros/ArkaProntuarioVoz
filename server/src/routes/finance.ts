import { Router } from "express";
import { auth } from "../middleware/auth";
import {
  createCategory,
  deleteTransaction,
  listCategories,
  listTransactions,
  monthlySummary,
  recordTransaction,
  setTransactionStatus,
} from "../use-cases/finance";

export const financeRouter = Router();

financeRouter.get("/categories", async (req, res) => {
  res.json(await listCategories(auth(req)));
});

financeRouter.post("/categories", async (req, res) => {
  res.status(201).json(await createCategory(auth(req), req.body));
});

financeRouter.get("/transactions", async (req, res) => {
  res.json(await listTransactions(auth(req), req.query.month));
});

financeRouter.post("/transactions", async (req, res) => {
  res.status(201).json(await recordTransaction(auth(req), req.body));
});

financeRouter.patch("/transactions/:id", async (req, res) => {
  res.json(await setTransactionStatus(auth(req), String(req.params.id), req.body));
});

financeRouter.delete("/transactions/:id", async (req, res) => {
  await deleteTransaction(auth(req), String(req.params.id));
  res.status(204).end();
});

financeRouter.get("/summary", async (req, res) => {
  res.json(await monthlySummary(auth(req), req.query.month));
});
