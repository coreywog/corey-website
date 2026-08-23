import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { WorkoutForm } from "@/components/admin/WorkoutForm";

export default async function AdminPage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const [exercises, recentSessions] = await Promise.all([
    prisma.exercise.findMany({ orderBy: { name: "asc" } }),
    prisma.workoutSession.findMany({
      orderBy: { date: "desc" },
      take: 5,
      include: {
        sets: {
          orderBy: { order: "asc" },
          include: { exercise: true },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Log a workout
        </h1>
        <form method="POST" action="/api/auth/logout">
          <button
            type="submit"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
          >
            Log out
          </button>
        </form>
      </div>

      <WorkoutForm exercises={exercises} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
          Recent sessions
        </h2>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {recentSessions.map((session) => (
              <li
                key={session.id}
                className="rounded-md border border-black/[.08] p-3 text-sm dark:border-white/[.1]"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">
                    {session.date.toISOString().slice(0, 10)}
                  </span>
                  {session.bodyweight != null && (
                    <span className="text-zinc-500">
                      {session.bodyweight} bw
                    </span>
                  )}
                </div>
                <ul className="mt-1 flex flex-col gap-0.5 text-zinc-600 dark:text-zinc-400">
                  {session.sets.map((set) => (
                    <li key={set.id}>
                      {set.exercise.name}: {set.weight}×{set.reps}
                      {set.rpe != null ? ` @${set.rpe}` : ""}
                    </li>
                  ))}
                </ul>
                {session.notes && (
                  <p className="mt-1 text-zinc-500 italic">{session.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
