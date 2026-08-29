"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Adds a new Dataset tab to Data Management. CSV only for now — see
 * app/api/data-hub/datasets/route.ts for why XLSX isn't supported yet.
 */
export function UploadDatasetForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("name", name.trim());
      body.set("file", file);
      const res = await fetch("/api/data-hub/datasets", { method: "POST", body });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        setError(errBody?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      const resBody = await res.json();
      setExpanded(false);
      setName("");
      setFile(null);
      formRef.current?.reset();
      router.push(`/data-hub?tab=${resBody.dataset.id}`);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setUploading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-full border border-dashed border-black/[.2] px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-800 dark:border-white/[.2] dark:hover:border-white/[.4] dark:hover:text-zinc-200 creamsicle:border-orange-300"
      >
        + Add dataset
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-black/[.1] p-2 dark:border-white/[.15]"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dataset name (e.g. Whoop sleep export)"
        className="rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
      />
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs text-zinc-500 file:mr-2 file:rounded-md file:border-0 file:bg-black/[.06] file:px-2 file:py-1 file:text-xs dark:file:bg-white/[.1]"
      />
      <button
        type="submit"
        disabled={uploading || !file || !name.trim()}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
      <button
        type="button"
        onClick={() => {
          setExpanded(false);
          setError(null);
        }}
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        Cancel
      </button>
      <span className="w-full text-[11px] text-zinc-500">CSV only, 5MB max.</span>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
