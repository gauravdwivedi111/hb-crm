-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- AlterTable Enquiry
ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "enquiryCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Enquiry_enquiryCode_key" ON "Enquiry"("enquiryCode");
CREATE INDEX IF NOT EXISTS "Enquiry_enquiryCode_idx" ON "Enquiry"("enquiryCode");

-- AlterTable Quotation
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "quotationNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");
CREATE INDEX IF NOT EXISTS "Quotation_quotationNumber_idx" ON "Quotation"("quotationNumber");
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(65,30);
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(65,30);
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(65,30);
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "items" JSONB;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "terms" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3);