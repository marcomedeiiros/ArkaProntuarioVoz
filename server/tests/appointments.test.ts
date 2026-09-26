import { beforeAll, describe, expect, it } from "vitest";
import { createClinic, loginAs, prisma, resetDb, tenantDb, type ClinicFixture } from "./helpers";

let c: ClinicFixture; // clínica com a Agenda liberada
let other: ClinicFixture; // clínica sem a Agenda

/** Horário de amanhã, em horas locais de Brasília (UTC-3). */
function at(hour: number, minute = 0, durationMin = 30) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour + 3, minute, 0, 0);
  return { startsAt: d.toISOString(), endsAt: new Date(d.getTime() + durationMin * 60_000).toISOString() };
}

beforeAll(async () => {
  await resetDb();
  c = await createClinic("Com agenda");
  other = await createClinic("Sem agenda");
  // A Arka liberou a Agenda só para a primeira clínica, que a deu a médicos(as) e secretárias.
  await prisma.clinic.update({ where: { id: c.clinic.id }, data: { modules: { push: "SCHEDULE" } } });
  await prisma.clinicRolePermission.createMany({
    data: [
      { clinicId: c.clinic.id, role: "DOCTOR", permission: "SCHEDULE" },
      { clinicId: c.clinic.id, role: "SECRETARY", permission: "SCHEDULE" },
    ],
    skipDuplicates: true, // a distribuição padrão do catálogo já dá a Agenda a esses cargos
  });
});

const book = async (agent: Awaited<ReturnType<typeof loginAs>>, extra: object) =>
  agent.post("/api/appointments").send({ patientId: c.patient.id, doctorId: c.users.doctor.id, ...extra });

describe("agenda", () => {
  it("a secretária marca para a médica e o horário aparece no período", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const res = await book(sec, { ...at(9), kind: "PUERICULTURA", notes: "Vacina de 4 meses" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ doctorName: c.users.doctor.name, status: "SCHEDULED", patient: { name: "João Pedro" } });

    const day = at(0, 0, 24 * 60);
    const list = await sec.get("/api/appointments").query({ from: day.startsAt, to: day.endsAt });
    expect(list.body.map((a: { id: string }) => a.id)).toContain(res.body.id);
  });

  it("não deixa o mesmo profissional ter dois horários ao mesmo tempo; cancelado libera", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const first = await book(sec, at(10));
    expect(first.status).toBe(201);
    const clash = await book(sec, { ...at(10, 15), patientId: c.otherPatient.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toContain(c.users.doctor.name);
    // Outro profissional no mesmo horário pode.
    expect((await book(sec, { ...at(10, 15), doctorId: c.users.doctor2.id })).status).toBe(201);

    expect((await sec.patch(`/api/appointments/${first.body.id}`).send({ status: "CANCELED" })).status).toBe(200);
    const again = await book(sec, { ...at(10, 15), patientId: c.otherPatient.id });
    expect(again.status).toBe(201);
    // Reativar o cancelado por cima de outro horário não pode.
    expect((await sec.patch(`/api/appointments/${first.body.id}`).send({ status: "SCHEDULED" })).status).toBe(409);
  });

  it("valida duração, paciente e profissional", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const nine = at(14);
    expect((await book(sec, { startsAt: nine.endsAt, endsAt: nine.startsAt })).status).toBe(400); // fim antes do início
    expect((await book(sec, at(14, 0, 300))).status).toBe(400); // mais de 4 h
    expect((await book(sec, { ...at(15), patientId: other.patient.id })).status).toBe(400); // paciente de outra clínica
    expect((await book(sec, { ...at(15), doctorId: c.users.secretary.id })).status).toBe(400); // secretária não atende
    expect((await book(sec, { ...at(15), doctorId: other.users.doctor.id })).status).toBe(400); // profissional de outra clínica

    const wide = at(0, 0, 90 * 24 * 60);
    expect((await sec.get("/api/appointments").query({ from: wide.startsAt, to: wide.endsAt })).status).toBe(400);
  });

  it("remarcar confere o choque de horário de novo", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const a = await book(sec, at(16));
    const b = await book(sec, { ...at(17), patientId: c.otherPatient.id });
    expect((await sec.patch(`/api/appointments/${b.body.id}`).send(at(16, 10))).status).toBe(409);
    const moved = await sec.patch(`/api/appointments/${b.body.id}`).send(at(18));
    expect(moved.status).toBe(200);
    expect(new Date(moved.body.startsAt).toISOString()).toBe(at(18).startsAt);
    expect(a.status).toBe(201);
  });

  it("iniciar o atendimento abre a consulta ligada ao horário (só quem tem Consultas)", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const appt = await book(sec, { ...at(11), kind: "RETORNO", patientId: c.otherPatient.id });
    expect((await sec.post(`/api/appointments/${appt.body.id}/start`)).status).toBe(403);

    const doctor = await loginAs(c.users.doctor.email);
    const started = await doctor.post(`/api/appointments/${appt.body.id}/start`);
    expect(started.status).toBe(200);
    const consultation = await tenantDb(c.clinic.id).consultation.findUniqueOrThrow({ where: { id: started.body.consultationId } });
    expect(consultation).toMatchObject({ patientId: c.otherPatient.id, doctorId: c.users.doctor.id, template: "URGENCIA" });
    const saved = await tenantDb(c.clinic.id).appointment.findUniqueOrThrow({ where: { id: appt.body.id } });
    expect(saved).toMatchObject({ status: "DONE", consultationId: consultation.id });

    // Clicar de novo não abre outra consulta.
    expect((await doctor.post(`/api/appointments/${appt.body.id}/start`)).body.consultationId).toBe(consultation.id);
  });

  it("clínica sem a Agenda liberada não usa, e uma clínica não vê a agenda da outra", async () => {
    const outsider = await loginAs(other.users.admin.email);
    const day = at(0, 0, 24 * 60);
    expect((await outsider.get("/api/appointments").query({ from: day.startsAt, to: day.endsAt })).status).toBe(403);

    await prisma.clinic.update({ where: { id: other.clinic.id }, data: { modules: { push: "SCHEDULE" } } });
    const list = await outsider.get("/api/appointments").query({ from: day.startsAt, to: day.endsAt });
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]); // o schema dela não tem os horários da outra clínica
    const mine = await tenantDb(c.clinic.id).appointment.findFirstOrThrow();
    expect((await outsider.patch(`/api/appointments/${mine.id}`).send({ status: "CANCELED" })).status).toBe(404);
  });
});
