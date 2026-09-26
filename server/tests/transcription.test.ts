import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, createClinic, loginAs, prisma, resetDb, type ClinicFixture, tenantDb } from "./helpers";

// O Whisper é simulado: os testes não carregam o modelo (gigabytes) nem gastam CPU.
vi.mock("../src/services/transcriber", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/transcriber")>()),
  transcribe: vi.fn(),
}));
import { cleanTranscript, transcribe } from "../src/services/transcriber";
const transcribeMock = vi.mocked(transcribe);

const RATE = 16_000;

/** PCM 16 bits mono 16 kHz: um tom (simula voz) ou silêncio. */
function pcm(seconds: number, amplitude = 0.3) {
  const buf = Buffer.alloc(Math.round(seconds * RATE) * 2);
  for (let i = 0; i < buf.length / 2; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / RATE) * amplitude * 32767), i * 2);
  }
  return buf;
}

let c: ClinicFixture;
let consultationId: string;

beforeAll(async () => {
  await resetDb();
  c = await createClinic();
  const doctor = await loginAs(c.users.doctor.email);
  const res = await doctor.post("/api/consultations").send({ patientId: c.patient.id, template: "URGENCIA" });
  consultationId = res.body.id;
});

beforeEach(() => {
  transcribeMock.mockReset();
  transcribeMock.mockResolvedValue("Febre desde ontem, trinta e oito e meio.");
});

const send = (agent: Awaited<ReturnType<typeof loginAs>>, body: Buffer, id = consultationId) =>
  agent.post(`/api/consultations/${id}/audio`).set("Content-Type", "application/octet-stream").send(body);

describe("transcrição no servidor", () => {
  it("transcreve os trechos e os anexa, em ordem, à transcrição salva", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const res = await send(doctor, pcm(3));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Febre desde ontem, trinta e oito e meio." });
    expect(transcribeMock).toHaveBeenCalledOnce();
    expect(transcribeMock.mock.calls[0][0]).toHaveLength(3 * RATE);

    transcribeMock.mockResolvedValueOnce("Sem vômitos.");
    expect((await send(doctor, pcm(2))).status).toBe(200);

    const saved = await tenantDb(c.clinic.id).consultation.findUniqueOrThrow({ where: { id: consultationId } });
    expect(saved.transcript).toBe("Febre desde ontem, trinta e oito e meio. Sem vômitos.");
  });

  it("não sobrescreve uma edição feita enquanto o áudio era transcrito", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const start = await doctor.post("/api/consultations").send({ patientId: c.patient.id, template: "URGENCIA" });
    transcribeMock.mockImplementationOnce(async () => {
      // A médica corrige o texto no meio da transcrição.
      await tenantDb(c.clinic.id).consultation.update({ where: { id: start.body.id }, data: { transcript: "Texto corrigido." } });
      return "Trecho novo.";
    });
    expect((await send(doctor, pcm(2), start.body.id)).status).toBe(200);
    const saved = await tenantDb(c.clinic.id).consultation.findUniqueOrThrow({ where: { id: start.body.id } });
    expect(saved.transcript).toBe("Texto corrigido. Trecho novo.");
  });

  it("recusa se a consulta for finalizada enquanto o áudio era transcrito", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const start = await doctor.post("/api/consultations").send({ patientId: c.patient.id, template: "URGENCIA" });
    transcribeMock.mockImplementationOnce(async () => {
      await tenantDb(c.clinic.id).consultation.update({ where: { id: start.body.id }, data: { status: "FINALIZED" } });
      return "Trecho atrasado.";
    });
    expect((await send(doctor, pcm(2), start.body.id)).status).toBe(409);
    const saved = await tenantDb(c.clinic.id).consultation.findUniqueOrThrow({ where: { id: start.body.id } });
    expect(saved.transcript).toBe("");
  });

  it("silêncio não vai para o Whisper (evita alucinações)", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const res = await send(doctor, pcm(5, 0));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "" });
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("secretária, outro(a) médico(a) e outra clínica não transcrevem", async () => {
    const secretary = await loginAs(c.users.secretary.email);
    expect((await send(secretary, pcm(2))).status).toBe(403);

    const doctor2 = await loginAs(c.users.doctor2.email);
    expect((await send(doctor2, pcm(2))).status).toBe(403);

    const other = await createClinic("Outra");
    const outsider = await loginAs(other.users.admin.email);
    expect((await send(outsider, pcm(2))).status).toBe(404);

    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("administração transcreve em qualquer consulta da clínica", async () => {
    const admin = await loginAs(c.users.admin.email);
    expect((await send(admin, pcm(2))).status).toBe(200);
  });

  it("consulta finalizada não recebe áudio", async () => {
    const finalized = await tenantDb(c.clinic.id).consultation.create({
      data: { doctorId: c.users.doctor.id, doctorName: c.users.doctor.name, patientId: c.patient.id, template: "URGENCIA", status: "FINALIZED" },
    });
    const doctor = await loginAs(c.users.doctor.email);
    expect((await send(doctor, pcm(2), finalized.id)).status).toBe(409);
  });

  it("valida o formato e o tamanho do áudio", async () => {
    const doctor = await loginAs(c.users.doctor.email);
    const url = `/api/consultations/${consultationId}/audio`;

    expect((await doctor.post(url).send({ audio: "base64..." })).status).toBe(415);
    expect((await send(doctor, Buffer.alloc(0))).status).toBe(415);
    expect((await send(doctor, Buffer.alloc(RATE * 2 + 1))).status).toBe(400); // tamanho ímpar
    expect((await send(doctor, pcm(0.2))).status).toBe(400); // curto demais
    expect((await send(doctor, pcm(31))).status).toBe(413); // passa de 30 s
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("exige sessão", async () => {
    const res = await api()
      .post(`/api/consultations/${consultationId}/audio`)
      .set("Content-Type", "application/octet-stream")
      .send(pcm(2));
    expect(res.status).toBe(401);
  });
});

describe("limpeza do texto do Whisper", () => {
  it("descarta frases que o Whisper inventa no silêncio", () => {
    expect(cleanTranscript(" Obrigado. ")).toBe("");
    expect(cleanTranscript("Legendas pela comunidade Amara.org")).toBe("");
    expect(cleanTranscript("Obrigado, doutora, ela melhorou.")).toBe("Obrigado, doutora, ela melhorou.");
  });

  it("corta repetições em laço sem mexer em repetições legítimas", () => {
    expect(cleanTranscript("5 ml de 12 em 12 em 12 em 12 em 12 em 12 horas")).toBe("5 ml de 12 em 12 horas");
    expect(cleanTranscript("5 ml de 12 em 12 horas por 10 dias")).toBe("5 ml de 12 em 12 horas por 10 dias");
    expect(cleanTranscript("tosse   seca\n à noite")).toBe("tosse seca à noite");
  });
});
