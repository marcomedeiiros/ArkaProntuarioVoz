import express, { Router } from "express";
import { MAX_BYTES } from "../lib/audio";
import { auth } from "../middleware/auth";
import { aiLimiter, transcriptionLimiter } from "../middleware/rate-limit";
import {
  countConsultationsByStatus,
  finalizeConsultation,
  generateDocuments,
  getConsultation,
  listConsultations,
  reopenConsultation,
  startConsultation,
  transcribeAudio,
  updateConsultation,
} from "../use-cases/consultations";

export const consultationsRouter = Router();

consultationsRouter.get("/", async (req, res) => {
  res.json(await listConsultations(auth(req), req.query));
});

consultationsRouter.get("/counts", async (req, res) => {
  res.json(await countConsultationsByStatus(auth(req)));
});

consultationsRouter.post("/", async (req, res) => {
  res.status(201).json(await startConsultation(auth(req), req.body));
});

consultationsRouter.get("/:id", async (req, res) => {
  res.json(await getConsultation(auth(req), String(req.params.id)));
});

consultationsRouter.patch("/:id", async (req, res) => {
  res.json(await updateConsultation(auth(req), String(req.params.id), req.body));
});

consultationsRouter.post("/:id/generate", aiLimiter, async (req, res) => {
  res.json(await generateDocuments(auth(req), String(req.params.id)));
});

// Trecho de áudio cru (PCM 16 bits, 16 kHz). Processado em memória e descartado.
consultationsRouter.post(
  "/:id/audio",
  transcriptionLimiter,
  express.raw({ type: "application/octet-stream", limit: MAX_BYTES }),
  async (req, res) => {
    res.json(await transcribeAudio(auth(req), String(req.params.id), req.body));
  },
);

consultationsRouter.post("/:id/finalize", async (req, res) => {
  res.json(await finalizeConsultation(auth(req), String(req.params.id)));
});

consultationsRouter.post("/:id/reopen", async (req, res) => {
  res.json(await reopenConsultation(auth(req), String(req.params.id)));
});
