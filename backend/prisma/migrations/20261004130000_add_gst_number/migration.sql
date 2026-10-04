-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstNumber" TEXT;

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "gstNumber" TEXT;
