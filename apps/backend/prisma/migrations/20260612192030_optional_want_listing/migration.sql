-- DropForeignKey
ALTER TABLE "Exchange" DROP CONSTRAINT "Exchange_wantListingId_fkey";

-- AlterTable
ALTER TABLE "Exchange" ALTER COLUMN "wantListingId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_wantListingId_fkey" FOREIGN KEY ("wantListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
