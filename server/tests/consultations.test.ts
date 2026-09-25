import Anthropic from "@anthropic-ai/sdk";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClinic, loginAs, prisma, resetDb, type ClinicFixture } from "./helpers";

// A IA é simulada: os testes nunca chamam a Anthropic nem gastam créditos.
vi.mock("../src/services/scribe", () => ({ generateClinicalDocs: vi.fn() }));
import { generateClinicalDocs } from "../src/services/scribe";
const generateMock = vi.mocked(generateClinicalDocs);

const DOCS = {
  evolucao: "ALIMENTAÇÃO: aleitamento materno exclusivo.\nCONDUTA: vitamina D.",
  prescricao: [{ medicamento: "Colecalciferol 200 UI/gota", posologia: "A DEFINIR", duracao: "Uso contínuo" }],
  orientacoesReceita: "Retorno em 1 mês.",
  guiaPais: "*Como foi a consulta do João hoje* 💙",
  alertas: ["Dose da vitamina D não foi dita."],
};

let c: ClinicFixture;

beforeAll(async () => {
  await resetDb();
  c = await createClinic();
});

beforeEach(() => {
  generateMock.mockReset();
  generateMock.mockResolvedValue(DOCS);
});

/** Nova consulta em rascunho, com transcrição suficiente para gerar. */
async function newDraft() {
  const doctor = await loginAs(c.users.doctor.email);
  const res = await doctor.post("/api/consultations").send({ patientId: c.patient.id, template: "PUERICULTURA" });
  expect(res.status).toBe(201);
  const long = "A mãe conta que o bebê mama no peito oito vezes ao dia, dorme bem e já sustenta a cabeça.";
  expect((await doctor.patch(`/api/consultations/${res.body.id}`).send({ transcript: long })).status).toBe(200);
  return { doctor, id: res.body.id as string };
}

describe("fluxo completo", () => {
  it("rascunho → gerada → finalizada → reaberta", async () => {
    const { doctor, id } = await newDraft();

    const gen = await doctor.post(`/api/consultations/${id}/generate`);
    expect(gen.status).toBe(200);
    expect(gen.body.status).toBe("GENERATED");
    expect(gen.body.evolution).toBe(DOCS.evolucao);
    expect(gen.body.alerts).toEqual(DOCS.alertas);
    expect(generateMock).toHaveBeenCalledOnce();

    const fin = await doctor.post(`/api/consultations/${id}/finalize`);
    expect(fin.status).toBe(200);
    expect(fin.body.status).toBe("FINALIZED");

    const reopen = await doctor.post(`/api/consultations/${id}/reopen`);
    expect(reopen.status).toBe(200);
    expect(reopen.body.status).toBe("GENERATED");
  });

  it("a IA recebe a idade, o peso e as alergias do paciente do banco, não do cliente", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const created = await doctor.post("/api/consultations").send({ patientId: c.otherPatient.id, template: "URGENCIA" });
    const id = created.body.id;
    await doctor.patch(`/api/consultations/${id}`).send({
      transcript: "Febre há um dia, otalgia à direita. Otoscopia com membrana abaulada. Otite média aguda.",
      weightKg: 12.4,
    });
    expect((await doctor.post(`/api/consultations/${id}/generate`)).status).toBe(200);
    const input = generateMock.mock.calls[0][0];
    expect(input.template).toBe("URGENCIA");
    expect(input.weightKg).toBe(12.4);
    expect(input.patient.allergies).toBe("Dipirona");
  });
});

describe("regras de cada etapa", () => {
  it("consulta finalizada não pode ser editada nem regerada", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const { finalized } = c.consultations;
    expect((await doctor.patch(`/api/consultations/${finalized.id}`).send({ transcript: "mudando" })).status).toBe(409);
    expect((await doctor.patch(`/api/consultations/${finalized.id}`).send({ evolution: "mudando" })).status).toBe(409);
    expect((await doctor.post(`/api/consultations/${finalized.id}/generate`)).status).toBe(409);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("rascunho não pode ser finalizado, reaberto, nem ter textos da IA editados", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const { draft } = c.consultations;
    expect((await doctor.post(`/api/consultations/${draft.id}/finalize`)).status).toBe(409);
    expect((await doctor.post(`/api/consultations/${draft.id}/reopen`)).status).toBe(409);
    expect((await doctor.patch(`/api/consultations/${draft.id}`).send({ evolution: "inventada" })).status).toBe(409);
  });

  it("status e campos desconhecidos nunca são aceitos pelo PATCH", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const { draft } = c.consultations;
    for (const body of [{ status: "FINALIZED" }, { doctorId: c.users.doctor2.id }, { clinicId: "outra" }, { alerts: [] }]) {
      expect((await doctor.patch(`/api/consultations/${draft.id}`).send(body)).status).toBe(400);
    }
    const unchanged = await prisma.consultation.findUniqueOrThrow({ where: { id: draft.id } });
    expect(unchanged.status).toBe("DRAFT");
    expect(unchanged.doctorId).toBe(c.users.doctor.id);
  });

  it("não finaliza consulta com evolução vazia", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const { generated } = c.consultations;
    expect((await doctor.patch(`/api/consultations/${generated.id}`).send({ evolution: "   " })).status).toBe(200);
    expect((await doctor.post(`/api/consultations/${generated.id}/finalize`)).status).toBe(409);
  });

  it("valida peso, estatura e tamanho dos textos", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const { draft } = c.consultations;
    expect((await doctor.patch(`/api/consultations/${draft.id}`).send({ weightKg: 900 })).status).toBe(400);
    expect((await doctor.patch(`/api/consultations/${draft.id}`).send({ weightKg: 0 })).status).toBe(400);
    expect((await doctor.patch(`/api/consultations/${draft.id}`).send({ heightCm: 5 })).status).toBe(400);
    expect((await doctor.patch(`/api/consultations/${draft.id}`).send({ transcript: "a".repeat(60_001) })).status).toBe(400);
    expect((await doctor.patch(`/api/consultations/${draft.id}`).send({ weightKg: 6.2, heightCm: 61 })).status).toBe(200);
  });
});

describe("geração por IA", () => {
  it("exige transcrição mínima", async () => {
    const { doctor, id } = await newDraft();
    await doctor.patch(`/api/consultations/${id}`).send({ transcript: "curta" });
    expect((await doctor.post(`/api/consultations/${id}/generate`)).status).toBe(400);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("não gera duas vezes ao mesmo tempo (clique duplo)", async () => {
    const { doctor, id } = await newDraft();
    let release!: () => void;
    generateMock.mockImplementation(() => new Promise((resolve) => (release = () => resolve(DOCS))));

    const first = doctor.post(`/api/consultations/${id}/generate`).then((r) => r);
    await vi.waitFor(() => expect(generateMock).toHaveBeenCalledOnce());
    const second = await doctor.post(`/api/consultations/${id}/generate`);
    expect(second.status).toBe(409);

    release();
    expect((await first).status).toBe(200);
  });

  it("traduz falhas da IA sem vazar detalhes internos", async () => {
    const { doctor, id } = await newDraft();

    generateMock.mockRejectedValueOnce(Object.create(Anthropic.RateLimitError.prototype));
    const busy = await doctor.post(`/api/consultations/${id}/generate`);
    expect(busy.status).toBe(429);

    // Chave da Anthropic ausente/errada no servidor: mensagem clara, sem expor a chave nem a resposta da API.
    generateMock.mockRejectedValueOnce(
      Object.assign(Object.create(Anthropic.AuthenticationError.prototype), { status: 401, message: "API key is invalid" }),
    );
    const noKey = await doctor.post(`/api/consultations/${id}/generate`);
    expect(noKey.status).toBe(503);
    expect(noKey.body.error).toContain("não está configurada");
    expect(JSON.stringify(noKey.body)).not.toContain("API key is invalid");

    generateMock.mockRejectedValueOnce(Object.assign(Object.create(Anthropic.APIError.prototype), { status: 500, message: "detalhe interno" }));
    const failed = await doctor.post(`/api/consultations/${id}/generate`);
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain("detalhe interno");

    // Depois da falha, a consulta continua em rascunho e pode ser gerada de novo.
    expect((await prisma.consultation.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
    expect((await doctor.post(`/api/consultations/${id}/generate`)).status).toBe(200);
  });
});

describe("listagem e contagens (calculadas no servidor)", () => {
  it("filtra por status e busca por paciente", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const finalized = await doctor.get("/api/consultations").query({ status: "FINALIZED" });
    expect(finalized.status).toBe(200);
    expect(finalized.body.every((x: { status: string }) => x.status === "FINALIZED")).toBe(true);

    const helena = await doctor.get("/api/consultations").query({ q: "helena" });
    expect(helena.body.every((x: { patient: { name: string } }) => x.patient.name.includes("Helena"))).toBe(true);

    expect((await doctor.get("/api/consultations").query({ status: "INVALIDO" })).status).toBe(400);
  });

  it("contagens batem com o banco", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const res = await doctor.get("/api/consultations/counts");
    const total = await prisma.consultation.count({ where: { clinicId: c.clinic.id } });
    expect(res.body.ALL).toBe(total);
    expect(res.body.DRAFT + res.body.GENERATED + res.body.FINALIZED).toBe(total);
  });
});
