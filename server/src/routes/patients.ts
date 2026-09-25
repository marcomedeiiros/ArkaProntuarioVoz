import { Router } from "express";
import { auth } from "../middleware/auth";
import { getPatientRecord, registerPatient, searchPatients, updatePatient } from "../use-cases/patients";

export const patientsRouter = Router();

patientsRouter.get("/", async (req, res) => {
  res.json(await searchPatients(auth(req), req.query.q));
});

patientsRouter.post("/", async (req, res) => {
  res.status(201).json(await registerPatient(auth(req), req.body));
});

patientsRouter.get("/:id", async (req, res) => {
  res.json(await getPatientRecord(auth(req), String(req.params.id)));
});

patientsRouter.put("/:id", async (req, res) => {
  res.json(await updatePatient(auth(req), String(req.params.id), req.body));
});
