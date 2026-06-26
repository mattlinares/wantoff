CREATE TYPE "JoinPolicy" AS ENUM ('PUBLIC', 'INVITE_ONLY');
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

CREATE TABLE "Group" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "slug"        TEXT        NOT NULL,
  "joinPolicy"  "JoinPolicy" NOT NULL DEFAULT 'PUBLIC',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

CREATE TABLE "GroupMembership" (
  "groupId"  TEXT         NOT NULL,
  "actorId"  TEXT         NOT NULL,
  "role"     "GroupRole"  NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("groupId","actorId")
);

CREATE TABLE "ListingGroup" (
  "listingId" TEXT         NOT NULL,
  "groupId"   TEXT         NOT NULL,
  "addedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingGroup_pkey" PRIMARY KEY ("listingId","groupId")
);

ALTER TABLE "GroupMembership"
  ADD CONSTRAINT "GroupMembership_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupMembership_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingGroup"
  ADD CONSTRAINT "ListingGroup_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ListingGroup_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
