-- One account granting another read/view access to *all* of its
-- dashboards (see lib/dashboardAccess.ts's getDashboardAccess) -- whole
-- account, not per-dashboard, matching what was actually asked for. No
-- rows exist yet; nothing to backfill.

-- CreateTable
CREATE TABLE "AccountShare" (
    "id" TEXT NOT NULL,
    "ownerUsername" TEXT NOT NULL,
    "viewerUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountShare_ownerUsername_viewerUsername_key" ON "AccountShare"("ownerUsername", "viewerUsername");

-- AddForeignKey
ALTER TABLE "AccountShare" ADD CONSTRAINT "AccountShare_ownerUsername_fkey" FOREIGN KEY ("ownerUsername") REFERENCES "AdminCredential"("username") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountShare" ADD CONSTRAINT "AccountShare_viewerUsername_fkey" FOREIGN KEY ("viewerUsername") REFERENCES "AdminCredential"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- An account can't share with itself.
ALTER TABLE "AccountShare" ADD CONSTRAINT "AccountShare_no_self_share_check" CHECK ("ownerUsername" <> "viewerUsername");
