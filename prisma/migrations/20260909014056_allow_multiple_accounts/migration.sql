-- AlterTable: id is now client-generated (cuid()) instead of the fixed
-- literal default "singleton" -- drop the DB-level default so Prisma
-- Client actually generates a distinct id per row on insert, instead of
-- every new row trying to reuse the same literal default and colliding.
-- The existing single row keeps its id ("singleton") unchanged -- only
-- the column's own default is being dropped, no data is touched.
ALTER TABLE "AdminCredential" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex: usernames must now be unique across accounts, since more
-- than one row can exist. Safe against current data -- there's exactly
-- one row today, trivially unique.
CREATE UNIQUE INDEX "AdminCredential_username_key" ON "AdminCredential"("username");
