import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, createClinic, loginAs, PASSWORD, prisma, randomPassword, resetDb, tenantDb, type ClinicFixture } from "./helpers";
import { ensurePlatformAdmin } from "../src/lib/bootstrap-admin";

// A Anthropic é simulada: nenhuma chave de verdade é testada nem gasta créditos.
vi.mock("../src/services/ai-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/ai-settings")>()),
  verifyAnthropicKey: vi.fn(),
}));
import { getAnthropicClient, verifyAnthropicKey } from "../src/services/ai-settings";
import { HttpError } from "../src/lib/http-error";
const verifyMock = vi.mocked(verifyAnthropicKey);

const ARKA_EMAIL = "conta.arka@teste.dev";
let a: ClinicFixture; // clínica A
let b: ClinicFixture; // clínica B

beforeAll(async () => {
  await resetDb();
  await ensurePlatformAdmin({ email: ARKA_EMAIL, password: PASSWORD });
  a = await createClinic("Clínica A");
  b = await createClinic("Clínica B");
});

beforeEach(() => {
  verifyMock.mockReset();
  verifyMock.mockResolvedValue(undefined);
});

afterAll(async () => {
  await prisma.platformSetting.deleteMany();
});

const arka = () => loginAs(ARKA_EMAIL);
const schemaExists = async (clinicId: string) =>
  (await prisma.$queryRaw<unknown[]>`SELECT 1 FROM pg_namespace WHERE nspname = ${`clinica_${clinicId}`}`).length === 1;

describe("conta da Arka", () => {
  it("não pertence a nenhuma clínica e não acessa dados de clínicas", async () => {
    const agent = await arka();
    const me = await agent.get("/api/auth/me");
    expect(me.body.user.platformAdmin).toBe(true);
    expect(me.body.clinic).toBeNull();
    for (const url of ["/api/patients", "/api/consultations", "/api/finance/transactions", "/api/users", "/api/dashboard"]) {
      expect((await agent.get(url)).status, url).toBe(403);
    }
  });

  it("a área da Arka é exclusiva dela, inclusive para administradores de clínica", async () => {
    const clinicAdmin = await loginAs(a.users.admin.email);
    for (const [method, url] of [
      ["get", "/api/platform/clinics"],
      ["put", `/api/platform/clinics/${a.clinic.id}/modules`],
      ["post", `/api/platform/clinics/${b.clinic.id}/suspend`],
      ["get", "/api/platform/settings/ai"],
      ["put", "/api/platform/settings/ai"],
    ] as const) {
      expect((await clinicAdmin[method](url).send({})).status, `${method} ${url}`).toBe(403);
    }
  });
});

describe("cada clínica tem o próprio espaço de dados", () => {
  it("os dados ficam em schemas separados e uma clínica não enxerga a outra", async () => {
    expect(await schemaExists(a.clinic.id)).toBe(true);
    expect(await schemaExists(b.clinic.id)).toBe(true);

    // O paciente de A existe só no schema de A.
    expect(await tenantDb(a.clinic.id).patient.findUnique({ where: { id: a.patient.id } })).not.toBeNull();
    expect(await tenantDb(b.clinic.id).patient.findUnique({ where: { id: a.patient.id } })).toBeNull();

    const fromB = await loginAs(b.users.admin.email);
    expect((await fromB.get(`/api/patients/${a.patient.id}`)).status).toBe(404);
    expect((await fromB.get(`/api/consultations/${a.consultations.draft.id}`)).status).toBe(404);
    const list = await fromB.get("/api/patients");
    expect(list.body.map((p: { id: string }) => p.id)).not.toContain(a.patient.id);
  });
});

describe("liberação de clínicas", () => {
  async function register() {
    const email = `nova.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@teste.dev`;
    const password = randomPassword();
    await api().post("/api/auth/register").send({ clinicName: "Clínica Nova", name: "Dra. Nova", email, password });
    const clinic = (await prisma.user.findUniqueOrThrow({ where: { email } })).clinicId!;
    return { email, password, clinic };
  }

  it("cadastro espera em análise, sem espaço de dados; liberar cria o schema e a clínica entra", async () => {
    const { email, password, clinic } = await register();
    expect(await schemaExists(clinic)).toBe(false);

    const agent = await arka();
    const list = await agent.get("/api/platform/clinics").query({ status: "PENDING" });
    expect(list.body.clinics.find((x: { id: string }) => x.id === clinic)).toMatchObject({ status: "PENDING", owner: { email } });
    expect((await api().post("/api/auth/login").send({ email, password })).status).toBe(403);

    expect((await agent.post(`/api/platform/clinics/${clinic}/approve`)).status).toBe(200);
    expect(await schemaExists(clinic)).toBe(true);
    expect(await tenantDb(clinic).financialCategory.count()).toBeGreaterThan(5);

    const login = await api().post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    // Empresa nova recebe todas as abas do catálogo.
    expect(login.body.user.permissions).toEqual(["SCHEDULE", "PATIENTS", "CONSULTATIONS", "FINANCE", "TEAM"]);
  });

  it("recusar mostra o motivo no login e não cria espaço de dados", async () => {
    const { email, password, clinic } = await register();
    expect((await (await arka()).post(`/api/platform/clinics/${clinic}/reject`).send({ reason: "CNPJ não confere" })).status).toBe(200);
    const login = await api().post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(403);
    expect(login.body.error).toContain("CNPJ não confere");
    expect(await schemaExists(clinic)).toBe(false);
  });

  it("suspender derruba as sessões na hora e mantém os dados; reativar devolve o acesso", async () => {
    const fresh = await createClinic("Suspensa");
    const doctor = await loginAs(fresh.users.doctor.email);
    expect((await doctor.get("/api/patients")).status).toBe(200);

    const agent = await arka();
    expect((await agent.post(`/api/platform/clinics/${fresh.clinic.id}/suspend`).send({ reason: "Pagamento em atraso" })).status).toBe(200);
    expect((await doctor.get("/api/patients")).status).toBe(401);
    const relogin = await api().post("/api/auth/login").send({ email: fresh.users.doctor.email, password: PASSWORD });
    expect(relogin.status).toBe(403);
    expect(relogin.body.error).toContain("Pagamento em atraso");
    expect(await tenantDb(fresh.clinic.id).patient.count()).toBe(2); // dados guardados

    expect((await agent.post(`/api/platform/clinics/${fresh.clinic.id}/reactivate`)).status).toBe(200);
    expect((await api().post("/api/auth/login").send({ email: fresh.users.doctor.email, password: PASSWORD })).status).toBe(200);
  });

  it("recusa transições inválidas", async () => {
    const agent = await arka();
    expect((await agent.post(`/api/platform/clinics/${a.clinic.id}/approve`)).status).toBe(409);
    expect((await agent.post(`/api/platform/clinics/nao-existe/approve`)).status).toBe(404);
  });
});

describe("módulos de cada empresa (definidos pela Arka)", () => {
  const setModules = async (clinicId: string, modules: string[]) =>
    (await arka()).put(`/api/platform/clinics/${clinicId}/modules`).send({ modules });

  it("tirar um módulo de uma clínica vale na hora para todos dela e não afeta a outra", async () => {
    const adminA = await loginAs(a.users.admin.email);
    const secA = await loginAs(a.users.secretary.email);
    const adminB = await loginAs(b.users.admin.email);

    expect((await setModules(a.clinic.id, ["PATIENTS", "CONSULTATIONS", "TEAM"])).status).toBe(200);
    expect((await adminA.get("/api/finance/transactions")).status).toBe(403);
    expect((await secA.get("/api/finance/transactions")).status).toBe(403);
    expect((await adminA.get("/api/dashboard")).body.finance).toBeNull();
    expect((await adminB.get("/api/finance/transactions")).status).toBe(200);

    expect((await setModules(a.clinic.id, ["PATIENTS", "CONSULTATIONS", "FINANCE", "TEAM"])).status).toBe(200);
    expect((await secA.get("/api/finance/transactions")).status).toBe(200);
  });

  it("consultas sem pacientes não fazem sentido, e aba fora do catálogo é recusada", async () => {
    const res = await setModules(a.clinic.id, ["CONSULTATIONS"]);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Pacientes");
    expect((await setModules(a.clinic.id, ["PATIENTS", "ABA_QUE_NAO_EXISTE"])).status).toBe(400);
  });

  it("a Arka vê o que cada cargo da empresa enxerga, sem nenhum dado de paciente", async () => {
    const res = await (await arka()).get(`/api/platform/clinics/${a.clinic.id}`);
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual({
      ADMIN: ["PATIENTS", "CONSULTATIONS", "FINANCE", "TEAM"],
      DOCTOR: ["PATIENTS", "CONSULTATIONS", "FINANCE"],
      SECRETARY: ["PATIENTS", "FINANCE"],
    });
    expect(res.body.team).toMatchObject({ ADMIN: 1, DOCTOR: 2, SECRETARY: 1 });
    expect(res.body.catalog.map((m: { key: string }) => m.key)).toEqual(["SCHEDULE", "PATIENTS", "CONSULTATIONS", "FINANCE", "TEAM"]);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("João Pedro"); // paciente da clínica
    expect(body).not.toContain("passwordHash");

    // Sem Financeiro na empresa, nenhum cargo vê Financeiro, mesmo que a clínica tenha distribuído.
    const after = await setModules(a.clinic.id, ["PATIENTS", "CONSULTATIONS", "TEAM"]);
    expect(after.body.roles.SECRETARY).toEqual(["PATIENTS"]);
    expect(after.body.roles.ADMIN).not.toContain("FINANCE");
    await setModules(a.clinic.id, ["PATIENTS", "CONSULTATIONS", "FINANCE", "TEAM"]);
  });
});

describe("distribuição entre os cargos (definida por cada clínica)", () => {
  const DEFAULT = { DOCTOR: ["PATIENTS", "CONSULTATIONS", "FINANCE"], SECRETARY: ["PATIENTS", "FINANCE"] };

  it("só a administração da clínica distribui, e só o que a Arka liberou", async () => {
    const adminA = await loginAs(a.users.admin.email);
    const doctorA = await loginAs(a.users.doctor.email);
    const got = await adminA.get("/api/users/role-permissions");
    expect(got.body).toMatchObject({ modules: ["PATIENTS", "CONSULTATIONS", "FINANCE", "TEAM"], ...DEFAULT });
    expect((await doctorA.get("/api/users/role-permissions")).status).toBe(403);
    expect((await doctorA.put("/api/users/role-permissions").send(DEFAULT)).status).toBe(403);

    // Módulo que a Arka não liberou não pode ser distribuído.
    await (await arka()).put(`/api/platform/clinics/${a.clinic.id}/modules`).send({ modules: ["PATIENTS", "CONSULTATIONS", "TEAM"] });
    expect((await adminA.put("/api/users/role-permissions").send({ ...DEFAULT, SECRETARY: ["PATIENTS", "FINANCE"] })).status).toBe(400);
    await (await arka()).put(`/api/platform/clinics/${a.clinic.id}/modules`).send({ modules: ["PATIENTS", "CONSULTATIONS", "FINANCE", "TEAM"] });
  });

  it("a distribuição de uma clínica não afeta a outra e vale sem novo login", async () => {
    const adminA = await loginAs(a.users.admin.email);
    const secA = await loginAs(a.users.secretary.email);
    const secB = await loginAs(b.users.secretary.email);
    expect((await secA.get("/api/consultations")).status).toBe(403);

    expect((await adminA.put("/api/users/role-permissions").send({ ...DEFAULT, SECRETARY: ["PATIENTS", "CONSULTATIONS"] })).status).toBe(200);
    expect((await secA.get("/api/consultations")).status).toBe(200);
    expect((await secA.get("/api/finance/transactions")).status).toBe(403);
    expect((await secB.get("/api/consultations")).status).toBe(403); // clínica B continua como estava
    expect((await secB.get("/api/finance/transactions")).status).toBe(200);

    expect((await adminA.put("/api/users/role-permissions").send({ DOCTOR: ["CONSULTATIONS"], SECRETARY: [] })).status).toBe(400);
    expect((await adminA.put("/api/users/role-permissions").send(DEFAULT)).status).toBe(200);
  });

  it("com equipe liberada, médico(a) gerencia pessoas, mas não mexe em administradores", async () => {
    const adminA = await loginAs(a.users.admin.email);
    await adminA.put("/api/users/role-permissions").send({ ...DEFAULT, DOCTOR: [...DEFAULT.DOCTOR, "TEAM"] });
    const doctor = await loginAs(a.users.doctor.email);
    const base = { name: "Pessoa Nova", password: randomPassword() };
    expect((await doctor.post("/api/users").send({ ...base, email: `s.${Date.now()}@teste.dev`, role: "SECRETARY" })).status).toBe(201);
    expect((await doctor.post("/api/users").send({ ...base, email: `a.${Date.now()}@teste.dev`, role: "ADMIN" })).status).toBe(403);
    expect((await doctor.patch(`/api/users/${a.users.admin.id}`).send({ active: false })).status).toBe(403);
    await adminA.put("/api/users/role-permissions").send(DEFAULT);
    expect((await doctor.get("/api/users")).status).toBe(403);
  });
});

describe("configurações da IA", () => {
  const KEY = "sk-ant-api03-" + "x".repeat(40) + "WXYZ";

  it("salva a chave criptografada e nunca a devolve inteira", async () => {
    const agent = await arka();
    const res = await agent.put("/api/platform/settings/ai").send({ key: KEY });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: true, source: "painel", last4: "WXYZ" });
    expect(JSON.stringify(res.body)).not.toContain(KEY.slice(0, 20));
    const stored = await prisma.platformSetting.findUniqueOrThrow({ where: { key: "anthropic_api_key" } });
    expect(stored.value).not.toContain("sk-ant");
    expect((await getAnthropicClient()).apiKey).toBe(KEY);
  });

  it("confere com a Anthropic antes de salvar: chave recusada não fica gravada", async () => {
    const agent = await arka();
    await agent.delete("/api/platform/settings/ai");
    verifyMock.mockRejectedValueOnce(new HttpError(400, "A Anthropic recusou esta chave."));
    expect((await agent.put("/api/platform/settings/ai").send({ key: KEY })).status).toBe(400);
    expect(await prisma.platformSetting.count()).toBe(0);
    expect((await agent.put("/api/platform/settings/ai").send({ key: "qualquer-coisa" })).status).toBe(400);
  });

  it("sem chave, a geração avisa que a IA não está configurada", async () => {
    await (await arka()).delete("/api/platform/settings/ai");
    await expect(getAnthropicClient()).rejects.toMatchObject({ status: 503 });
  });
});
