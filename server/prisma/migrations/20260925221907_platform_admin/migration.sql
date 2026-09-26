-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('PATIENTS', 'CONSULTATIONS', 'FINANCE', 'TEAM');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ClinicStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" "Role" NOT NULL,
    "permission" "Permission" NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","permission")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);
