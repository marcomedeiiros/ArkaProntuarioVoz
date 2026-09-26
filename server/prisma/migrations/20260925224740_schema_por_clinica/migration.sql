-- Separação por clínica: os dados de cada clínica passam a morar no schema próprio dela
-- ("clinica_<id>"). As tabelas antigas, com os dados de todas juntas, NÃO são apagadas:
-- vão para o schema "legado" (fora do alcance do Prisma), e a API copia para cada clínica
-- o que é dela na primeira vez que o espaço da clínica é preparado.

CREATE SCHEMA IF NOT EXISTS "legado";

-- Desliga os dados antigos das tabelas da plataforma (contas e clínicas).
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_clinicId_fkey";
ALTER TABLE "Consultation" DROP CONSTRAINT IF EXISTS "Consultation_clinicId_fkey";
ALTER TABLE "Consultation" DROP CONSTRAINT IF EXISTS "Consultation_doctorId_fkey";
ALTER TABLE "FinancialCategory" DROP CONSTRAINT IF EXISTS "FinancialCategory_clinicId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_clinicId_fkey";

ALTER TABLE "Patient" SET SCHEMA "legado";
ALTER TABLE "Consultation" SET SCHEMA "legado";
ALTER TABLE "FinancialCategory" SET SCHEMA "legado";
ALTER TABLE "Transaction" SET SCHEMA "legado";
ALTER TYPE "Sex" SET SCHEMA "legado";
ALTER TYPE "ConsultationTemplate" SET SCHEMA "legado";
ALTER TYPE "ConsultationStatus" SET SCHEMA "legado";
ALTER TYPE "TransactionType" SET SCHEMA "legado";
ALTER TYPE "PaymentMethod" SET SCHEMA "legado";
ALTER TYPE "TransactionStatus" SET SCHEMA "legado";

-- Clínica: módulos liberados pela Arka e controle do espaço de dados próprio.
ALTER TABLE "Clinic" ADD COLUMN "modules" "Permission"[] DEFAULT ARRAY['PATIENTS', 'CONSULTATIONS', 'FINANCE', 'TEAM']::"Permission"[];
ALTER TABLE "Clinic" ADD COLUMN "provisionedAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN "legacyImportedAt" TIMESTAMP(3);

-- Contas da Arka não pertencem a nenhuma clínica.
ALTER TABLE "User" ALTER COLUMN "clinicId" DROP NOT NULL;
UPDATE "User" SET "clinicId" = NULL WHERE "platformAdmin" = true;

-- Permissões por cargo passam a ser de cada clínica (antes era uma matriz única para todas).
CREATE TABLE "ClinicRolePermission" (
    "clinicId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permission" "Permission" NOT NULL,
    CONSTRAINT "ClinicRolePermission_pkey" PRIMARY KEY ("clinicId", "role", "permission")
);
ALTER TABLE "ClinicRolePermission" ADD CONSTRAINT "ClinicRolePermission_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ClinicRolePermission" ("clinicId", "role", "permission")
SELECT c."id", rp."role", rp."permission" FROM "Clinic" c CROSS JOIN "RolePermission" rp WHERE rp."role" <> 'ADMIN';

DROP TABLE "RolePermission";
