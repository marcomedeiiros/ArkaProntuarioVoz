import { Router } from "express";
import { auth } from "../middleware/auth";
import { addTeamMember, deleteTeamMember, listTeam, revokeMemberSessions, updateTeamMember } from "../use-cases/users";

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  res.json(await listTeam(auth(req)));
});

usersRouter.post("/", async (req, res) => {
  res.status(201).json(await addTeamMember(auth(req), req.body));
});

usersRouter.patch("/:id", async (req, res) => {
  res.json(await updateTeamMember(auth(req), String(req.params.id), req.body));
});

usersRouter.post("/:id/revoke-sessions", async (req, res) => {
  await revokeMemberSessions(auth(req), String(req.params.id));
  res.status(204).end();
});

usersRouter.delete("/:id", async (req, res) => {
  await deleteTeamMember(auth(req), String(req.params.id));
  res.status(204).end();
});
