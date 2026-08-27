-- Edit/Publish mode for dashboards: published=false shows drag/resize
-- handles and add/edit/delete controls; true renders the grid read-only.
ALTER TABLE "Dashboard" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
