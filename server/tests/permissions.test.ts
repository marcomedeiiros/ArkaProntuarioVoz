import { beforeAll, describe, expect, it } from "vitest";
import { api, createClinic, loginAs, PASSWORD, prisma, randomPassword, resetDb, type ClinicFixture, tenantDb } from "./helpers";

let c: ClinicFixture;
let other: ClinicFixture;

beforeAll(async () => {
  await resetDb();
  c = await createClinic("Clínica A");
  other = await createClinic("Clínica B");
});

describe("secretária não acessa dados clínicos", () => {
  it("não lista, não abre, não conta e não inicia consultas", async () => {
    const sec = await loginAs(c.users.secretary.email);
    expect((await sec.get("/api/consultations")).status).toBe(403);
    expect((await sec.get("/api/consultations/counts")).status).toBe(403);
    expect((await sec.get(`/api/consultations/${c.consultations.generated.id}`)).status).toBe(403);
    expect((await sec.post("/api/consultations").send({ patientId: c.patient.id, template: "URGENCIA" })).status).toBe(403);
    expect((await sec.post(`/api/consultations/${c.consultations.generated.id}/finalize`)).status).toBe(403);
  });

  it("vê o painel só com o financeiro", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const res = await sec.get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.clinical).toBeNull();
    expect(res.body.finance).toHaveProperty("income");
  });

  it("na ficha do paciente vê o histórico sem conteúdo clínico", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const res = await sec.get(`/api/patients/${c.patient.id}`);
    expect(res.status).toBe(200);
    expect(res.body.consultations.length).toBe(3);
    for (const h of res.body.consultations) {
      expect(h).not.toHaveProperty("evolution");
      expect(h).not.toHaveProperty("transcript");
    }
  });
});

describe("médico(a) só altera as próprias consultas", () => {
  it("colega lê, mas não edita, não gera e não finaliza", async () => {
    const colleague = await loginAs(c.users.doctor2.email);
    const { draft, generated } = c.consultations;
    expect((await colleague.get(`/api/consultations/${draft.id}`)).status).toBe(200);
    expect((await colleague.patch(`/api/consultations/${draft.id}`).send({ transcript: "invadindo" })).status).toBe(403);
    expect((await colleague.post(`/api/consultations/${draft.id}/generate`)).status).toBe(403);
    expect((await colleague.post(`/api/consultations/${generated.id}/finalize`)).status).toBe(403);
  });

  it("administração pode alterar consultas de qualquer médico(a)", async () => {
    const admin = await loginAs(c.users.admin.email);
    const res = await admin.patch(`/api/consultations/${c.consultations.draft.id}`).send({ weightKg: 6.2 });
    expect(res.status).toBe(200);
  });
});

describe("isolamento entre clínicas", () => {
  it("não enxerga pacientes, consultas nem lançamentos de outra clínica", async () => {
    const intruder = await loginAs(other.users.admin.email);
    expect((await intruder.get(`/api/patients/${c.patient.id}`)).status).toBe(404);
    const validPatient = { name: "Alterado", birthDate: "2025-01-01", sex: "M", guardianName: "Invasor", guardianPhone: "27999990000" };
    expect((await intruder.put(`/api/patients/${c.patient.id}`).send(validPatient)).status).toBe(404);
    expect((await intruder.get(`/api/consultations/${c.consultations.draft.id}`)).status).toBe(404);
    expect((await intruder.patch(`/api/consultations/${c.consultations.draft.id}`).send({ transcript: "x" })).status).toBe(404);

    const search = await intruder.get("/api/patients").query({ q: "João" });
    // Cada clínica só enxerga o próprio schema: nenhum paciente da clínica A aparece na busca da B.
    const ids = search.body.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(c.patient.id);
    expect(ids).toContain(other.patient.id);
  });

  it("não usa categoria, paciente ou consulta de outra clínica", async () => {
    const intruder = await loginAs(other.users.admin.email);
    const tx = { type: "INCOME", amount: 100, method: "PIX", date: "2026-09-10" };
    expect((await intruder.post("/api/finance/transactions").send({ ...tx, categoryId: c.income.id })).status).toBe(400);
    expect((await intruder.post("/api/finance/transactions").send({ ...tx, categoryId: other.income.id, patientId: c.patient.id })).status).toBe(400);
    expect((await intruder.post("/api/finance/transactions").send({ ...tx, categoryId: other.income.id, consultationId: c.consultations.draft.id })).status).toBe(400);
  });

  it("não inicia consulta para paciente de outra clínica nem mexe na equipe dela", async () => {
    const intruder = await loginAs(other.users.admin.email);
    expect((await intruder.post("/api/consultations").send({ patientId: c.patient.id, template: "URGENCIA" })).status).toBe(404);
    expect((await intruder.patch(`/api/users/${c.users.doctor.id}`).send({ active: false })).status).toBe(404);
    expect((await intruder.post(`/api/users/${c.users.doctor.id}/revoke-sessions`)).status).toBe(404);
  });
});

describe("equipe", () => {
  it("só administração adiciona pessoas, altera perfis e encerra sessões", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const member = { name: "Nova Pessoa", email: `nova.${Date.now()}@teste.dev`, password: randomPassword(), role: "ADMIN" };
    expect((await doctor.post("/api/users").send(member)).status).toBe(403);
    expect((await doctor.patch(`/api/users/${c.users.secretary.id}`).send({ role: "ADMIN" })).status).toBe(403);
    expect((await doctor.post(`/api/users/${c.users.secretary.id}/revoke-sessions`)).status).toBe(403);

    const admin = await loginAs(c.users.admin.email);
    expect((await admin.post("/api/users").send({ ...member, role: "SECRETARY" })).status).toBe(201);
    expect((await admin.post("/api/users").send({ ...member, role: "SECRETARY" })).status).toBe(409);
  });

  it("ninguém altera o próprio acesso", async () => {
    const admin = await loginAs(c.users.admin.email);
    expect((await admin.patch(`/api/users/${c.users.admin.id}`).send({ active: false })).status).toBe(400);
    expect((await admin.patch(`/api/users/${c.users.admin.id}`).send({ role: "DOCTOR" })).status).toBe(400);
  });

  it("a última administradora não pode ser removida por ninguém", async () => {
    const fresh = await createClinic("Clínica C");
    // A administradora passa o bastão: promove a médica e é rebaixada por ela.
    const admin = await loginAs(fresh.users.admin.email);
    expect((await admin.patch(`/api/users/${fresh.users.doctor.id}`).send({ role: "ADMIN" })).status).toBe(200);
    const newAdmin = await loginAs(fresh.users.doctor.email);
    expect((await newAdmin.patch(`/api/users/${fresh.users.admin.id}`).send({ role: "DOCTOR" })).status).toBe(200);

    // Agora a médica é a única administradora: ela não pode se rebaixar nem se desativar...
    expect((await newAdmin.patch(`/api/users/${fresh.users.doctor.id}`).send({ role: "DOCTOR" })).status).toBe(400);
    expect((await newAdmin.patch(`/api/users/${fresh.users.doctor.id}`).send({ active: false })).status).toBe(400);
    // ...e quem não é administrador não pode mexer nela.
    const exAdmin = await loginAs(fresh.users.admin.email);
    expect((await exAdmin.patch(`/api/users/${fresh.users.doctor.id}`).send({ role: "DOCTOR" })).status).toBe(403);
  });

  it("desativar corta o acesso na hora e reativar não ressuscita a sessão antiga", async () => {
    const admin = await loginAs(c.users.admin.email);
    const sec = await loginAs(c.users.secretary.email);
    expect((await admin.patch(`/api/users/${c.users.secretary.id}`).send({ active: false })).status).toBe(200);
    expect((await sec.get("/api/patients")).status).toBe(401);
    expect((await admin.patch(`/api/users/${c.users.secretary.id}`).send({ active: true })).status).toBe(200);
    expect((await sec.get("/api/patients")).status).toBe(401);
    expect((await (await loginAs(c.users.secretary.email, PASSWORD)).get("/api/patients")).status).toBe(200);
  });

  it("mudança de perfil vale na hora, sem novo login", async () => {
    const admin = await loginAs(c.users.admin.email);
    const sec = await loginAs(c.users.secretary.email);
    expect((await sec.get("/api/consultations")).status).toBe(403);
    await admin.patch(`/api/users/${c.users.secretary.id}`).send({ role: "DOCTOR" });
    expect((await sec.get("/api/consultations")).status).toBe(200);
    await admin.patch(`/api/users/${c.users.secretary.id}`).send({ role: "SECRETARY" });
    expect((await sec.get("/api/consultations")).status).toBe(403);
  });

  it("administração encerra as sessões de alguém da equipe", async () => {
    const admin = await loginAs(c.users.admin.email);
    const doctor = await loginAs(c.users.doctor.email);
    expect((await admin.post(`/api/users/${c.users.doctor.id}/revoke-sessions`)).status).toBe(204);
    expect((await doctor.get("/api/auth/me")).status).toBe(401);
  });
});

describe("apagar conta da equipe", () => {
  async function newMember(role = "SECRETARY") {
    const admin = await loginAs(c.users.admin.email);
    const password = randomPassword();
    const res = await admin.post("/api/users").send({ name: "Temporária", email: `temp.${Date.now()}@teste.dev`, password, role });
    expect(res.status).toBe(201);
    return { admin, member: res.body as { id: string; email: string }, password };
  }

  it("administração apaga; a pessoa perde a sessão e não entra mais", async () => {
    const { admin, member, password } = await newMember();
    const session = await loginAs(member.email, password);
    expect((await session.get("/api/auth/me")).status).toBe(200);

    expect((await admin.delete(`/api/users/${member.id}`)).status).toBe(204);
    expect((await session.get("/api/auth/me")).status).toBe(401);
    expect((await api().post("/api/auth/login").send({ email: member.email, password })).status).toBe(401);
    expect((await admin.delete(`/api/users/${member.id}`)).status).toBe(404);
  });

  it("só administração apaga, e ninguém apaga a si mesmo", async () => {
    const { member } = await newMember();
    const doctor = await loginAs(c.users.doctor.email);
    expect((await doctor.delete(`/api/users/${member.id}`)).status).toBe(403);
    const secretary = await loginAs(c.users.secretary.email);
    expect((await secretary.delete(`/api/users/${member.id}`)).status).toBe(403);

    const admin = await loginAs(c.users.admin.email);
    expect((await admin.delete(`/api/users/${c.users.admin.id}`)).status).toBe(400);
  });

  it("quem já atendeu não pode ser apagado: o prontuário precisa ser guardado", async () => {
    const { admin, member } = await newMember("DOCTOR");
    await tenantDb(c.clinic.id).consultation.create({
      data: { doctorId: member.id, doctorName: "Temporária", patientId: c.patient.id, template: "PUERICULTURA" },
    });
    const res = await admin.delete(`/api/users/${member.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Desative");
    expect(await prisma.user.findUnique({ where: { id: member.id } })).not.toBeNull();

    const team = (await admin.get("/api/users")).body as { id: string; consultationCount: number }[];
    expect(team.find((u) => u.id === member.id)?.consultationCount).toBe(1);
  });

  it("não apaga ninguém de outra clínica", async () => {
    const other = await createClinic("Clínica D");
    const admin = await loginAs(c.users.admin.email);
    expect((await admin.delete(`/api/users/${other.users.secretary.id}`)).status).toBe(404);
    expect(await prisma.user.findUnique({ where: { id: other.users.secretary.id } })).not.toBeNull();
  });
});
