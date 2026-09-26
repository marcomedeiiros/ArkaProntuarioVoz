-- As abas deixam de ser um tipo fixo do banco (enum) e passam a ser texto validado pelo catálogo
-- em server/src/lib/modules.ts. Assim, criar uma aba nova não exige migração. Os valores atuais são mantidos.

ALTER TABLE "Clinic" ALTER COLUMN "modules" DROP DEFAULT;
ALTER TABLE "Clinic" ALTER COLUMN "modules" TYPE TEXT[] USING "modules"::TEXT[];
ALTER TABLE "Clinic" ALTER COLUMN "modules" SET DEFAULT ARRAY['PATIENTS', 'CONSULTATIONS', 'FINANCE', 'TEAM']::TEXT[];

ALTER TABLE "ClinicRolePermission" ALTER COLUMN "permission" TYPE TEXT USING "permission"::TEXT;

DROP TYPE "Permission";
