import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, createClinic, loginAs, PASSWORD, prisma, randomPassword, resetDb, type ClinicFixture } from "./helpers";

// Nenhum e-mail sai de verdade: capturamos a mensagem para ler o link.
vi.mock("../src/lib/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/mailer")>()),
  sendMail: vi.fn().mockResolvedValue(undefined),
}));
import { sendMail } from "../src/lib/mailer";
const sendMailMock = vi.mocked(sendMail);

let c: ClinicFixture;

beforeAll(async () => {
  await resetDb();
  c = await createClinic();
});

beforeEach(async () => {
  sendMailMock.mockClear();
  await prisma.passwordResetToken.deleteMany();
});

const forgot = (email: string) => api().post("/api/auth/forgot-password").send({ email });
const reset = (token: string, password: string) => api().post("/api/auth/reset-password").send({ token, password });

/** Pede o link e devolve o token lido do e-mail enviado. */
async function requestToken(email: string) {
  expect((await forgot(email)).status).toBe(204);
  await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalled());
  const mail = sendMailMock.mock.calls.at(-1)![0];
  const token = /#token=([\w-]+)/.exec(mail.text)?.[1];
  expect(token).toBeDefined();
  return { mail, token: token! };
}

/** Deixa a senha da pessoa como a padrão dos testes de novo. */
async function restorePassword(userId: string) {
  const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: c.users.admin.id } });
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

describe("esqueci a senha", () => {
  it("responde igual para e-mail cadastrado e não cadastrado, e só envia para quem existe", async () => {
    const known = await forgot(c.users.doctor.email);
    const unknown = await forgot("ninguem.aqui@teste.dev");
    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
    expect(known.body).toEqual(unknown.body);
    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledOnce());
    expect(sendMailMock.mock.calls[0][0].to).toBe(c.users.doctor.email);
  });

  it("guarda só o hash do token, com o link no fragmento (#) da URL", async () => {
    const { mail, token } = await requestToken(c.users.doctor.email);
    expect(mail.text).toContain("/redefinir-senha#token=");
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: c.users.doctor.id } });
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("troca a senha, derruba todas as sessões e o link não vale de novo", async () => {
    const session = await loginAs(c.users.doctor.email);
    const { token } = await requestToken(c.users.doctor.email);
    const newPassword = randomPassword();

    expect((await reset(token, newPassword)).status).toBe(204);
    expect((await session.get("/api/auth/me")).status).toBe(401);
    expect((await api().post("/api/auth/login").send({ email: c.users.doctor.email, password: PASSWORD })).status).toBe(401);
    expect((await api().post("/api/auth/login").send({ email: c.users.doctor.email, password: newPassword })).status).toBe(200);

    expect((await reset(token, randomPassword())).status).toBe(400); // uso único
    await restorePassword(c.users.doctor.id);
  });

  it("recusa link expirado, inventado ou substituído por um mais novo", async () => {
    const first = await requestToken(c.users.doctor.email);
    const second = await requestToken(c.users.doctor.email);
    expect((await reset(first.token, randomPassword())).status).toBe(400); // só o mais recente vale

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(second.token, randomPassword())).status).toBe(400);

    expect((await reset("x".repeat(43), randomPassword())).status).toBe(400);
    expect((await reset(second.token, "curta")).status).toBe(400); // senha nova também é validada
  });

  it("não envia para contas desativadas e o link para de valer se a pessoa for desativada", async () => {
    const { token } = await requestToken(c.users.secretary.email);
    await prisma.user.update({ where: { id: c.users.secretary.id }, data: { active: false } });
    expect((await reset(token, randomPassword())).status).toBe(400);

    sendMailMock.mockClear();
    expect((await forgot(c.users.secretary.email)).status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMailMock).not.toHaveBeenCalled();
    await prisma.user.update({ where: { id: c.users.secretary.id }, data: { active: true } });
  });

  it("limita a 3 e-mails por hora para a mesma pessoa", async () => {
    for (let i = 0; i < 3; i++) await requestToken(c.users.admin.email);
    sendMailMock.mockClear();
    expect((await forgot(c.users.admin.email)).status).toBe(204); // mesma resposta, mas sem e-mail
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("o mesmo IP não consegue pedir mais de 5 links para o mesmo e-mail em 15 minutos", async () => {
    const target = "alvo.de.spam@teste.dev";
    for (let i = 0; i < 5; i++) expect((await forgot(target)).status).toBe(204);
    expect((await forgot(target)).status).toBe(429);
    expect((await forgot(target.toUpperCase())).status).toBe(429); // maiúsculas não burlam
  });

  it("trocar a senha pela tela da conta invalida links pendentes", async () => {
    const { token } = await requestToken(c.users.doctor2.email);
    const agent = await loginAs(c.users.doctor2.email);
    const newPassword = randomPassword();
    expect((await agent.post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword })).status).toBe(200);
    expect((await reset(token, randomPassword())).status).toBe(400);
    await restorePassword(c.users.doctor2.id);
  });
});
