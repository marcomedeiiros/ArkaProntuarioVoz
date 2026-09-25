import { beforeAll, describe, expect, it } from "vitest";
import { api, createClinic, loginAs, PASSWORD, prisma, randomPassword, resetDb, sessionCookie, type ClinicFixture } from "./helpers";

let c: ClinicFixture;

beforeAll(async () => {
  await resetDb();
  c = await createClinic();
});

describe("login e cookie de sessão", () => {
  /** Validade do token em segundos (exp - iat), lida sem verificar a assinatura. */
  const tokenLifetime = (cookie: string) => {
    const payload = JSON.parse(Buffer.from(cookie.split(";")[0].split("=")[1].split(".")[1], "base64url").toString());
    return payload.exp - payload.iat;
  };

  it("abre sessão num cookie httpOnly, SameSite=Strict, restrito a /api, que some ao fechar o navegador", async () => {
    const res = await api().post("/api/auth/login").send({ email: c.users.admin.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api/i);
    expect(cookie).not.toMatch(/Max-Age|Expires/i); // cookie de sessão
    expect(tokenLifetime(cookie)).toBe(8 * 60 * 60);
  });

  it('"lembrar de mim" mantém a sessão por 14 dias, inclusive depois de trocar a senha', async () => {
    const res = await api().post("/api/auth/login").send({ email: c.users.doctor2.email, password: PASSWORD, remember: true });
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/Max-Age=1209600/i);
    expect(tokenLifetime(cookie)).toBe(14 * 24 * 60 * 60);

    const newPassword = randomPassword();
    const changed = await api()
      .post("/api/auth/change-password")
      .set("Cookie", cookie.split(";")[0])
      .send({ currentPassword: PASSWORD, newPassword });
    expect(changed.status).toBe(200);
    expect(sessionCookie(changed)).toMatch(/Max-Age=1209600/i);
    // Devolve a senha padrão dos testes (todas as pessoas do fixture usam o mesmo hash).
    await prisma.user.update({
      where: { id: c.users.doctor2.id },
      data: { passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: c.users.admin.id } })).passwordHash },
    });
  });

  it('"lembrar de mim" só aceita verdadeiro/falso', async () => {
    const res = await api().post("/api/auth/login").send({ email: c.users.admin.email, password: PASSWORD, remember: "sempre" });
    expect(res.status).toBe(400);
  });

  it("nunca devolve o token no corpo da resposta", async () => {
    const res = await api().post("/api/auth/login").send({ email: c.users.admin.email, password: PASSWORD });
    expect(res.body).not.toHaveProperty("token");
    expect(JSON.stringify(res.body)).not.toContain(sessionCookie(res)!.split(";")[0].split("=")[1]);
    expect(res.body.user).toMatchObject({ email: c.users.admin.email, role: "ADMIN" });
  });

  it("recusa senha errada e e-mail inexistente com a mesma mensagem", async () => {
    const wrong = await api().post("/api/auth/login").send({ email: c.users.admin.email, password: "errada" });
    const unknown = await api().post("/api/auth/login").send({ email: "ninguem@teste.dev", password: "errada" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it("não deixa entrar quem está desativado", async () => {
    await prisma.user.update({ where: { id: c.users.doctor2.id }, data: { active: false } });
    const res = await api().post("/api/auth/login").send({ email: c.users.doctor2.email, password: PASSWORD });
    expect(res.status).toBe(401);
    await prisma.user.update({ where: { id: c.users.doctor2.id }, data: { active: true } });
  });

  it("recusa requisição sem sessão, com token forjado ou com o token no cabeçalho Authorization", async () => {
    expect((await api().get("/api/patients")).status).toBe(401);
    expect((await api().get("/api/patients").set("Cookie", "pv_session=abc.def.ghi")).status).toBe(401);

    const login = await api().post("/api/auth/login").send({ email: c.users.admin.email, password: PASSWORD });
    const token = sessionCookie(login)!.split(";")[0].split("=")[1];
    expect((await api().get("/api/patients").set("Authorization", `Bearer ${token}`)).status).toBe(401);
    expect((await api().get("/api/patients").set("Cookie", `pv_session=${token}`)).status).toBe(200);
  });

  it("/auth/me devolve a sessão atual", async () => {
    const agent = await loginAs(c.users.secretary.email);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("SECRETARY");
    expect(res.body.clinic.id).toBe(c.clinic.id);
  });
});

describe("proteção contra CSRF", () => {
  it("recusa alterações vindas de outro site", async () => {
    const agent = await loginAs(c.users.admin.email);
    const res = await agent.post("/api/finance/categories").set("Origin", "https://site-malicioso.com").send({ name: "Invasão", type: "INCOME" });
    expect(res.status).toBe(403);
  });

  it("recusa Referer malformado", async () => {
    const agent = await loginAs(c.users.admin.email);
    const res = await agent.post("/api/finance/categories").set("Referer", "::lixo::").send({ name: "Invasão", type: "INCOME" });
    expect(res.status).toBe(403);
  });

  it("aceita alterações do próprio site", async () => {
    const agent = await loginAs(c.users.admin.email);
    const res = await agent.post("/api/finance/categories").set("Origin", "http://localhost:5173").send({ name: "Teleconsulta", type: "INCOME" });
    expect(res.status).toBe(201);
  });
});

describe("encerrar sessões", () => {
  it("logout apaga o cookie deste aparelho", async () => {
    const agent = await loginAs(c.users.doctor.email);
    const res = await agent.post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/pv_session=;/);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("sair de todos os aparelhos derruba todas as sessões da pessoa", async () => {
    const phone = await loginAs(c.users.doctor.email);
    const laptop = await loginAs(c.users.doctor.email);
    expect((await laptop.post("/api/auth/logout-all")).status).toBe(204);
    expect((await phone.get("/api/auth/me")).status).toBe(401);
    expect((await laptop.get("/api/auth/me")).status).toBe(401);
    // Um login novo volta a funcionar normalmente.
    expect((await (await loginAs(c.users.doctor.email)).get("/api/auth/me")).status).toBe(200);
  });

  it("não afeta as sessões de outras pessoas", async () => {
    const secretary = await loginAs(c.users.secretary.email);
    const doctor = await loginAs(c.users.doctor.email);
    await doctor.post("/api/auth/logout-all");
    expect((await secretary.get("/api/auth/me")).status).toBe(200);
  });
});

describe("troca de senha", () => {
  it("exige a senha atual correta e uma senha nova diferente", async () => {
    const agent = await loginAs(c.users.doctor2.email);
    expect((await agent.post("/api/auth/change-password").send({ currentPassword: "errada", newPassword: randomPassword() })).status).toBe(400);
    expect((await agent.post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400);
    expect((await agent.post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword: "curta" })).status).toBe(400);
  });

  it("troca a senha, mantém este aparelho e desconecta os outros", async () => {
    const other = await loginAs(c.users.admin.email);
    const current = await loginAs(c.users.admin.email);
    const newPassword = randomPassword();
    const res = await current.post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeDefined();

    expect((await current.get("/api/auth/me")).status).toBe(200);
    expect((await other.get("/api/auth/me")).status).toBe(401);
    expect((await api().post("/api/auth/login").send({ email: c.users.admin.email, password: PASSWORD })).status).toBe(401);
    expect((await api().post("/api/auth/login").send({ email: c.users.admin.email, password: newPassword })).status).toBe(200);

    await current.post("/api/auth/change-password").send({ currentPassword: newPassword, newPassword: PASSWORD });
  });
});

describe("cadastro de clínica", () => {
  it("cria clínica, administradora e categorias, já com sessão aberta", async () => {
    const email = `nova.${Date.now()}@teste.dev`;
    const res = await api().post("/api/auth/register").send({ clinicName: "Consultório Novo", name: "Dra. Nova", email, password: randomPassword() });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("ADMIN");
    expect(sessionCookie(res)).toBeDefined();
    const categories = await prisma.financialCategory.count({ where: { clinicId: res.body.clinic.id } });
    expect(categories).toBeGreaterThan(5);
  });

  it("não aceita e-mail repetido nem senha fraca", async () => {
    expect((await api().post("/api/auth/register").send({ clinicName: "X Clínica", name: "Pessoa", email: c.users.admin.email, password: randomPassword() })).status).toBe(409);
    expect((await api().post("/api/auth/register").send({ clinicName: "X Clínica", name: "Pessoa", email: "outra@teste.dev", password: "123" })).status).toBe(400);
  });
});

describe("respostas de erro", () => {
  it("JSON malformado vira 400 e rota inexistente vira 404", async () => {
    const bad = await api().post("/api/auth/login").set("Content-Type", "application/json").send("{email:");
    expect(bad.status).toBe(400);
    const agent = await loginAs(c.users.secretary.email);
    expect((await agent.get("/api/nao-existe")).status).toBe(404);
  });
});

// Por último: depois disto o login fica bloqueado para este IP.
describe("força bruta", () => {
  it("bloqueia o IP depois de 10 tentativas de login erradas", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await api().post("/api/auth/login").send({ email: c.users.admin.email, password: `errada-${i}` })).status;
    }
    expect(last).toBe(429);
  });
});
