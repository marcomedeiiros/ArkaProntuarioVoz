import { beforeAll, describe, expect, it } from "vitest";
import { createClinic, loginAs, resetDb, type ClinicFixture } from "./helpers";

let c: ClinicFixture;

beforeAll(async () => {
  await resetDb();
  c = await createClinic();
});

const patient = { name: "Laura Ferreira", birthDate: "2025-12-10", sex: "F", guardianName: "Patrícia", guardianPhone: "(27) 99544-8899" };

describe("pacientes", () => {
  it("cadastra e guarda o telefone só com dígitos", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const res = await sec.post("/api/patients").send(patient);
    expect(res.status).toBe(201);
    expect(res.body.guardianPhone).toBe("27995448899");
    expect(res.body.clinicId).toBe(c.clinic.id);
  });

  it.each([
    ["nascimento no futuro", { birthDate: "2099-01-01" }],
    ["acima de 21 anos", { birthDate: "1990-01-01" }],
    ["telefone curto", { guardianPhone: "123" }],
    ["nome de uma letra", { name: "A" }],
    ["nome gigante", { name: "a".repeat(5000) }],
    ["sexo inválido", { sex: "X" }],
    ["alergias gigantes", { allergies: "a".repeat(600) }],
  ])("recusa %s", async (_label, override) => {
    const sec = await loginAs(c.users.secretary.email);
    expect((await sec.post("/api/patients").send({ ...patient, ...override })).status).toBe(400);
  });

  it("ignora campos que o cliente não deveria controlar (clinicId)", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const res = await sec.post("/api/patients").send({ ...patient, clinicId: "clinica-de-outra-pessoa" });
    expect(res.status).toBe(201);
    expect(res.body.clinicId).toBe(c.clinic.id);
  });
});

describe("financeiro", () => {
  const tx = () => ({ type: "INCOME", amount: 350, method: "PIX", date: "2026-09-10", categoryId: c.income.id });

  it("arredonda centavos e liga pagamento de consulta ao paciente dela", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const cents = await sec.post("/api/finance/transactions").send({ ...tx(), amount: 350.555 });
    expect(cents.status).toBe(201);
    expect(Number(cents.body.amount)).toBe(350.56);

    const payment = await sec.post("/api/finance/transactions").send({ ...tx(), consultationId: c.consultations.finalized.id });
    expect(payment.status).toBe(201);
    expect(payment.body.patient.id).toBe(c.patient.id);
  });

  it.each([
    ["valor negativo", { amount: -50 }],
    ["valor zero", { amount: 0 }],
    ["valor acima de 1 milhão", { amount: 5_000_000 }],
    ["valor em texto", { amount: "cem" }],
    ["data em 1990", { date: "1990-01-01" }],
    ["data daqui a 5 anos", { date: "2031-01-01" }],
    ["forma de pagamento inventada", { method: "BITCOIN" }],
    ["descrição gigante", { description: "a".repeat(300) }],
  ])("recusa %s", async (_label, override) => {
    const sec = await loginAs(c.users.secretary.email);
    expect((await sec.post("/api/finance/transactions").send({ ...tx(), ...override })).status).toBe(400);
  });

  it("categoria precisa ser do mesmo tipo do lançamento", async () => {
    const sec = await loginAs(c.users.secretary.email);
    expect((await sec.post("/api/finance/transactions").send({ ...tx(), categoryId: c.expense.id })).status).toBe(400);
  });

  it("pagamento de consulta é sempre entrada e do mesmo paciente", async () => {
    const sec = await loginAs(c.users.secretary.email);
    const consultationId = c.consultations.finalized.id;
    expect((await sec.post("/api/finance/transactions").send({ ...tx(), type: "EXPENSE", categoryId: c.expense.id, consultationId })).status).toBe(400);
    expect((await sec.post("/api/finance/transactions").send({ ...tx(), consultationId, patientId: c.otherPatient.id })).status).toBe(400);
  });

  it("resumo do mês é calculado no servidor", async () => {
    const sec = await loginAs(c.users.secretary.email);
    await sec.post("/api/finance/transactions").send({ ...tx(), date: "2026-08-05", amount: 100 });
    await sec.post("/api/finance/transactions").send({ ...tx(), date: "2026-08-06", amount: 50, status: "PENDING" });
    await sec.post("/api/finance/transactions").send({ ...tx(), date: "2026-08-07", amount: 30, type: "EXPENSE", categoryId: c.expense.id });

    const res = await sec.get("/api/finance/summary").query({ month: "2026-08" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ income: 100, expense: 30, balance: 70, pendingIncome: 50 });
    expect((await sec.get("/api/finance/summary").query({ month: "2026-13" })).status).toBe(400);
  });

  it("não altera nem apaga lançamento de outra clínica", async () => {
    const other = await createClinic("Outra");
    const mine = await (await loginAs(c.users.secretary.email)).post("/api/finance/transactions").send(tx());
    const intruder = await loginAs(other.users.secretary.email);
    expect((await intruder.patch(`/api/finance/transactions/${mine.body.id}`).send({ status: "PENDING" })).status).toBe(404);
    expect((await intruder.delete(`/api/finance/transactions/${mine.body.id}`)).status).toBe(404);
  });
});
