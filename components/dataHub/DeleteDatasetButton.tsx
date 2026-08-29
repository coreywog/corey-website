"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteDatasetButton({ datasetId, name }: { datasetId: string; name: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete "${name}" and all its rows? This can't be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/data-hub/datasets/${datasetId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/data-hub");
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
    >
      {deleting ? "Removing…" : "Delete dataset"}
    </button>
  );
}
