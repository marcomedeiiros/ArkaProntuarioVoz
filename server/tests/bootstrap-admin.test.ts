import { beforeAll, describe, expect, it } from "vitest";
import { api, prisma, randomPassword, resetDb } from "./helpers";
import { ensureAdmin } from "../src/lib/bootstrap-admin";

beforeAll(async () => {
  await resetDb();
});

const login = (email: string, password: string) => api().post("/api/auth/login").send({ email, password });

describe("administrador inicial (.env desta máquina)", () => {
  it("cria a clínica, as categorias e o administrador, que já consegue entrar", async () => {
    const password = randomPassword();
    expect(await ensureAdmin({ email: "Dono@Clinica.dev", password, clinicName: "Clínica Inicial" })).toBe("created");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "dono@clinica.dev" }, include: { clinic: true } });
    expect(user.role).toBe("ADMIN");
    expect(user.clinic.name).toBe("Clínica Inicial");
    expect(await prisma.financialCategory.count({ where: { clinicId: user.clinicId } })).toBeGreaterThan(0);
    expect(user.passwordHash).not.toContain(password);
    expect((await login("dono@clinica.dev", password)).status).toBe(200);
  });

  it("nunca altera uma conta que já existe (a senha trocada pela tela continua valendo)", async () => {
    const original = randomPassword();
    await ensureAdmin({ email: "fixo@clinica.dev", password: original, clinicName: "Clínica Fixa" });
    const before = await prisma.user.findUniqueOrThrow({ where: { email: "fixo@clinica.dev" } });

    expect(await ensureAdmin({ email: "fixo@clinica.dev", password: randomPassword(), clinicName: "Outra" })).toBe("exists");
    const after = await prisma.user.findUniqueOrThrow({ where: { email: "fixo@clinica.dev" } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.clinicId).toBe(before.clinicId);
    expect(await prisma.clinic.count({ where: { name: "Outra" } })).toBe(0);
  });

  it("reaproveita a clínica com o mesmo nome em vez de duplicar", async () => {
    await ensureAdmin({ email: "a@mesma.dev", password: randomPassword(), clinicName: "Mesma Clínica" });
    await ensureAdmin({ email: "b@mesma.dev", password: randomPassword(), clinicName: "Mesma Clínica" });
    expect(await prisma.clinic.count({ where: { name: "Mesma Clínica" } })).toBe(1);
  });

  it("valida e-mail e senha", async () => {
    await expect(ensureAdmin({ email: "sem-arroba", password: randomPassword() })).rejects.toThrow();
    await expect(ensureAdmin({ email: "curta@clinica.dev", password: "123" })).rejects.toThrow();
  });
});
