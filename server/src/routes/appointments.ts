import { Router } from "express";
import { auth } from "../middleware/auth";
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  listProfessionals,
  startFromAppointment,
  updateAppointment,
} from "../use-cases/appointments";

/** Agenda: rotas finas, as regras ficam em use-cases/appointments.ts. */
export const appointmentsRouter = Router();

appointmentsRouter.get("/", async (req, res) => {
  res.json(await listAppointments(auth(req), req.query));
});

appointmentsRouter.get("/professionals", async (req, res) => {
  res.json(await listProfessionals(auth(req)));
});

appointmentsRouter.post("/", async (req, res) => {
  res.status(201).json(await createAppointment(auth(req), req.body));
});

appointmentsRouter.patch("/:id", async (req, res) => {
  res.json(await updateAppointment(auth(req), String(req.params.id), req.body));
});

appointmentsRouter.delete("/:id", async (req, res) => {
  await deleteAppointment(auth(req), String(req.params.id));
  res.status(204).end();
});

appointmentsRouter.post("/:id/start", async (req, res) => {
  res.json(await startFromAppointment(auth(req), String(req.params.id)));
});
