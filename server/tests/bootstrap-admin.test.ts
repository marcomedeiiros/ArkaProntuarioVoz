import { beforeAll, describe, expect, it } from "vitest";
import { api, prisma, randomPassword, resetDb } from "./helpers";
import { ensurePlatformAdmin } from "../src/lib/bootstrap-admin";

beforeAll(async () => {
  await resetDb();
});

const login = (email: string, password: string) => api().post("/api/auth/login").send({ email, password });

describe("conta da Arka do .env desta máquina", () => {
  it("cria a conta da Arka, sem clínica, que já consegue entrar", async () => {
    const password = randomPassword();
    expect(await ensurePlatformAdmin({ email: "Dono@Arka.dev", password })).toBe("created");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "dono@arka.dev" } });
    expect(user.platformAdmin).toBe(true);
    expect(user.clinicId).toBeNull();
    expect(user.passwordHash).not.toContain(password);

    const res = await login("dono@arka.dev", password);
    expect(res.status).toBe(200);
    expect(res.body.user.platformAdmin).toBe(true);
    expect(res.body.clinic).toBeNull();
    expect(res.body.user.permissions).toEqual([]);
  });

  it("nunca altera uma conta que já existe (a senha trocada pela tela continua valendo)", async () => {
    await ensurePlatformAdmin({ email: "fixo@arka.dev", password: randomPassword() });
    const before = await prisma.user.findUniqueOrThrow({ where: { email: "fixo@arka.dev" } });
    expect(await ensurePlatformAdmin({ email: "fixo@arka.dev", password: randomPassword() })).toBe("exists");
    const after = await prisma.user.findUniqueOrThrow({ where: { email: "fixo@arka.dev" } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("valida e-mail e senha", async () => {
    await expect(ensurePlatformAdmin({ email: "sem-arroba", password: randomPassword() })).rejects.toThrow();
    await expect(ensurePlatformAdmin({ email: "curta@arka.dev", password: "123" })).rejects.toThrow();
  });
});
