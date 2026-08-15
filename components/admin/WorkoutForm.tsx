"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Exercise = {
  id: string;
  name: string;
  category: string;
};

const NEW_EXERCISE_VALUE = "__new__";
const EXERCISE_CATEGORIES = ["push", "pull", "legs", "cardio"] as const;

type SetRow = {
  key: string;
  exerciseId: string;
  newExerciseName: string;
  newExerciseCategory: (typeof EXERCISE_CATEGORIES)[number];
  weight: string;
  reps: string;
  rpe: string;
};

function emptyRow(key: string): SetRow {
  return {
    key,
    exerciseId: "",
    newExerciseName: "",
    newExerciseCategory: "push",
    weight: "",
    reps: "",
    rpe: "",
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function WorkoutForm({ exercises }: { exercises: Exercise[] }) {
  const router = useRouter();
  const [date, setDate] = useState(todayIsoDate());
  const [bodyweight, setBodyweight] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<SetRow[]>([emptyRow("0")]);
  const [nextKey, setNextKey] = useState(1);
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(key: string, patch: Partial<SetRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(String(nextKey))]);
    setNextKey((n) => n + 1);
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((row) => row.key !== key) : prev,
    );
  }

  function resetForm() {
    setDate(todayIsoDate());
    setBodyweight("");
    setNotes("");
    setRows([emptyRow(String(nextKey))]);
    setNextKey((n) => n + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const sets = [];
    for (const row of rows) {
      const weight = Number(row.weight);
      const reps = Number(row.reps);
      if (!row.exerciseId) {
        setStatus({ type: "error", message: "Pick an exercise for every set." });
        return;
      }
      if (!Number.isFinite(weight) || !Number.isFinite(reps)) {
        setStatus({
          type: "error",
          message: "Weight and reps are required for every set.",
        });
        return;
      }

      const set: Record<string, unknown> = {
        weight,
        reps,
        ...(row.rpe ? { rpe: Number(row.rpe) } : {}),
      };

      if (row.exerciseId === NEW_EXERCISE_VALUE) {
        if (!row.newExerciseName.trim()) {
          setStatus({ type: "error", message: "Name the new exercise." });
          return;
        }
        set.newExercise = {
          name: row.newExerciseName.trim(),
          category: row.newExerciseCategory,
        };
      } else {
        set.exerciseId = row.exerciseId;
      }

      sets.push(set);
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          ...(bodyweight ? { bodyweight: Number(bodyweight) } : {}),
          ...(notes ? { notes } : {}),
          sets,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatus({
          type: "error",
          message: body?.error ?? `Failed to save (${res.status}).`,
        });
        return;
      }

      setStatus({
        type: "success",
        message: `Logged ${sets.length} set${sets.length === 1 ? "" : "s"} — nice work.`,
      });
      resetForm();
      router.refresh();
    } catch {
      setStatus({ type: "error", message: "Network error — try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Bodyweight (optional)
          </span>
          <input
            type="number"
            step="0.1"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
      </label>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Sets
        </span>
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-md border border-black/[.08] p-3 dark:border-white/[.1]"
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
                <span className="text-xs text-zinc-500">Exercise</span>
                <select
                  value={row.exerciseId}
                  onChange={(e) =>
                    updateRow(row.key, { exerciseId: e.target.value })
                  }
                  required
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                  <option value={NEW_EXERCISE_VALUE}>+ Add new exercise</option>
                </select>
              </label>
              <label className="flex w-20 flex-col gap-1.5">
                <span className="text-xs text-zinc-500">Weight</span>
                <input
                  type="number"
                  step="0.5"
                  value={row.weight}
                  onChange={(e) =>
                    updateRow(row.key, { weight: e.target.value })
                  }
                  required
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                />
              </label>
              <label className="flex w-16 flex-col gap-1.5">
                <span className="text-xs text-zinc-500">Reps</span>
                <input
                  type="number"
                  value={row.reps}
                  onChange={(e) => updateRow(row.key, { reps: e.target.value })}
                  required
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                />
              </label>
              <label className="flex w-16 flex-col gap-1.5">
                <span className="text-xs text-zinc-500">RPE</span>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={row.rpe}
                  onChange={(e) => updateRow(row.key, { rpe: e.target.value })}
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                />
              </label>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
                className="rounded-md px-2 py-2 text-sm text-zinc-500 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
                aria-label="Remove set"
              >
                ✕
              </button>
            </div>
            {row.exerciseId === NEW_EXERCISE_VALUE && (
              <div className="flex flex-wrap items-end gap-2 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
                  <span className="text-xs text-zinc-500">New exercise name</span>
                  <input
                    type="text"
                    value={row.newExerciseName}
                    onChange={(e) =>
                      updateRow(row.key, { newExerciseName: e.target.value })
                    }
                    required
                    className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-zinc-500">Category</span>
                  <select
                    value={row.newExerciseCategory}
                    onChange={(e) =>
                      updateRow(row.key, {
                        newExerciseCategory: e.target
                          .value as SetRow["newExerciseCategory"],
                      })
                    }
                    className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                  >
                    {EXERCISE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="self-start rounded-md border border-black/[.1] px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
        >
          + Add set
        </button>
      </div>

      {status && (
        <p
          className={
            status.type === "success"
              ? "text-sm text-emerald-600 dark:text-emerald-400"
              : "text-sm text-red-600 dark:text-red-400"
          }
        >
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {submitting ? "Saving…" : "Log workout"}
      </button>
    </form>
  );
}
