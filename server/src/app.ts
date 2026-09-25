import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./env";
import { requireAuth } from "./middleware/auth";
import { requireSameOrigin } from "./middleware/origin";
import { errorHandler } from "./middleware/error";
import { apiLimiter } from "./middleware/rate-limit";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { patientsRouter } from "./routes/patients";
import { consultationsRouter } from "./routes/consultations";
import { financeRouter } from "./routes/finance";
import { dashboardRouter } from "./routes/dashboard";

/*
 * Arquitetura: rotas finas -> casos de uso (src/use-cases).
 * Toda regra de negócio, validação e permissão mora nos casos de uso. O front-end
 * só apresenta; qualquer requisição é tratada como potencialmente maliciosa.
 */
export const app = express();

// Atrás de proxy/load balancer (produção), confie no primeiro salto para o IP real do cliente.
if (env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(helmet());
// A sessão viaja num cookie; só o site oficial pode fazer requisições com credenciais.
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", apiLimiter);
app.use("/api", requireSameOrigin);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/patients", requireAuth, patientsRouter);
app.use("/api/consultations", requireAuth, consultationsRouter);
app.use("/api/finance", requireAuth, financeRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

app.use(errorHandler);
