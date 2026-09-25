// Cria um usuário administrador, sem deixar a senha no código nem no terminal.
//
//   NEW_ADMIN_PASSWORD=... npm run user:create-admin -- --email pessoa@exemplo.com [--name "Nome"] [--clinic "parte do nome"]
//   NEW_ADMIN_PASSWORD=... npm run user:create-admin -- --email pessoa@exemplo.com --new-clinic "Arka Tecnologia"
//
// A senha vem só da variável NEW_ADMIN_PASSWORD (não vai para os argumentos, que ficam visíveis na lista de processos).
// Sem --clinic, usa a única clínica cadastrada. Com --new-clinic, cria a clínica (se não existir) e põe a pessoa nela.
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { email as emailSchema, password as passwordSchema } from "../src/lib/validation";
import { ensureAdmin } from "../src/lib/bootstrap-admin";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = emailSchema.parse(arg("email"));
  const password = passwordSchema.parse(process.env.NEW_ADMIN_PASSWORD);
  const name = z.string().trim().min(2).max(120).parse(arg("name") ?? "Administrador");
  const clinicFilter = arg("clinic");

  const newClinic = arg("new-clinic");
  if (newClinic) {
    const result = await ensureAdmin({ email, password, name, clinicName: newClinic });
    if (result === "exists") throw new Error("Já existe um usuário com esse e-mail.");
    console.log(`Administrador ${email} criado na clínica "${newClinic}".`);
    return;
  }

  const clinics = await prisma.clinic.findMany({
    where: clinicFilter ? { name: { contains: clinicFilter, mode: "insensitive" } } : undefined,
    select: { id: true, name: true },
  });
  if (clinics.length !== 1) {
    throw new Error(
      clinics.length ? `Mais de uma clínica encontrada. Use --clinic: ${clinics.map((c) => c.name).join(", ")}` : "Nenhuma clínica encontrada.",
    );
  }

  if (await prisma.user.findUnique({ where: { email } })) throw new Error("Já existe um usuário com esse e-mail.");

  await prisma.user.create({
    data: { name, email, role: "ADMIN", clinicId: clinics[0].id, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Administrador ${email} criado na clínica "${clinics[0].name}".`);
}

main()
  .catch((err) => {
    console.error(err instanceof z.ZodError ? err.issues[0].message : (err as Error).message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
