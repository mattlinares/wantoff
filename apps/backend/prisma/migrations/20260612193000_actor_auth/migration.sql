-- AlterTable
ALTER TABLE "Actor" ADD COLUMN "email" TEXT NOT NULL,
ADD COLUMN "passwordHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Actor_email_key" ON "Actor"("email");
