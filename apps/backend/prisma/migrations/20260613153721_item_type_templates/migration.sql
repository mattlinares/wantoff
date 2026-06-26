-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ItemTypeTemplate" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldSchema" JSONB NOT NULL,
    "defaultFees" JSONB NOT NULL,
    "defaultCurrencies" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemTypeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemTypeTemplate_itemType_key" ON "ItemTypeTemplate"("itemType");
