-- CreateTable Product
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "subCategory" TEXT,
    "department" TEXT,
    "description" TEXT,
    "packSize" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'Pcs',
    "hsnCode" TEXT,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18.0,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "mrp" DECIMAL(12,2),
    "purchasePrice" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_code_key" ON "Product"("code");
CREATE INDEX IF NOT EXISTS "Product_code_idx" ON "Product"("code");
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");
CREATE INDEX IF NOT EXISTS "Product_brand_idx" ON "Product"("brand");
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");
CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON "Product"("isActive");
