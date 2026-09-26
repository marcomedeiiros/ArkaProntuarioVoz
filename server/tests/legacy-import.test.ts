import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma, resetDb, tenantDb } from "./helpers";
import { provisionTenant } from "../src/lib/tenant";

beforeAll(async () => {
  await resetDb();
  await prisma.$executeRawUnsafe(`TRUNCATE legado."Transaction", legado."Consultation", legado."FinancialCategory", legado."Patient" CASCADE`);
});

describe("dados de antes da separação por clínica", () => {
  it("são copiados para o schema da clínica dona, e só para ela", async () => {
    const mine = await prisma.clinic.create({ data: { name: "Clínica antiga" } });
    const other = await prisma.clinic.create({ data: { name: "Outra clínica antiga" } });
    const doctor = await prisma.user.create({
      data: { clinicId: mine.id, name: "Dra. Antiga", email: `antiga.${Date.now()}@teste.dev`, role: "DOCTOR", passwordHash: await bcrypt.hash("x", 4) },
    });

    // Como estava no banco antes desta versão (tabelas únicas com clinicId), agora no schema "legado".
    for (const [id, clinicId] of [["p_minha", mine.id], ["p_outra", other.id]]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO legado."Patient" (id, "clinicId", name, "birthDate", sex, "guardianName", "guardianPhone", "updatedAt")
         VALUES ($1, $2, 'Criança', now(), 'F', 'Mãe', '27999990000', now())`,
        id,
        clinicId,
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO legado."Consultation" (id, "clinicId", "patientId", "doctorId", template, status, "updatedAt")
       VALUES ('c_minha', $1, 'p_minha', $2, 'PUERICULTURA', 'FINALIZED', now())`,
      mine.id,
      doctor.id,
    );

    await provisionTenant(mine.id);
    const db = tenantDb(mine.id);
    expect((await db.patient.findMany()).map((p) => p.id)).toEqual(["p_minha"]);
    const c = await db.consultation.findUniqueOrThrow({ where: { id: "c_minha" } });
    expect(c).toMatchObject({ status: "FINALIZED", doctorId: doctor.id, doctorName: "Dra. Antiga" });

    // Rodar de novo não duplica nada.
    await provisionTenant(mine.id);
    expect(await db.patient.count()).toBe(1);
  });
});
