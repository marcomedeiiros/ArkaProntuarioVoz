import { Router } from "express";
import { platformAuth } from "../middleware/auth";
import { passwordLimiter } from "../middleware/rate-limit";
import {
  clearAiKey,
  getClinicDetail,
  getAiSettings,
  listClinics,
  reviewClinic,
  setAiKey,
  setClinicModules,
  testAiKey,
} from "../use-cases/platform";

/** Área da Arka (dona do SaaS). platformAuth recusa qualquer conta que não seja da Arka. */
export const platformRouter = Router();

platformRouter.get("/clinics", async (req, res) => {
  res.json(await listClinics(platformAuth(req), req.query));
});

for (const action of ["approve", "reject", "suspend", "reactivate"] as const) {
  platformRouter.post(`/clinics/:id/${action}`, async (req, res) => {
    res.json(await reviewClinic(platformAuth(req), String(req.params.id), action, req.body));
  });
}

platformRouter.get("/clinics/:id", async (req, res) => {
  res.json(await getClinicDetail(platformAuth(req), String(req.params.id)));
});

platformRouter.put("/clinics/:id/modules", async (req, res) => {
  res.json(await setClinicModules(platformAuth(req), String(req.params.id), req.body));
});

platformRouter.get("/settings/ai", async (req, res) => {
  res.json(await getAiSettings(platformAuth(req)));
});

// Salvar e testar a chave falam com a Anthropic: limite de tentativas como na troca de senha.
platformRouter.put("/settings/ai", passwordLimiter, async (req, res) => {
  res.json(await setAiKey(platformAuth(req), req.body));
});

platformRouter.delete("/settings/ai", async (req, res) => {
  res.json(await clearAiKey(platformAuth(req)));
});

platformRouter.post("/settings/ai/test", passwordLimiter, async (req, res) => {
  res.json(await testAiKey(platformAuth(req)));
});
