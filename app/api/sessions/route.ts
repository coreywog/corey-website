import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const EXERCISE_CATEGORIES = ["push", "pull", "legs", "cardio"] as const;

const setSchema = z
  .object({
    exerciseId: z.string().min(1).optional(),
    newExercise: z
      .object({
        name: z.string().min(1).max(100),
        category: z.enum(EXERCISE_CATEGORIES),
      })
      .optional(),
    weight: z.number().nonnegative(),
    reps: z.number().int().positive(),
    rpe: z.number().min(1).max(10).optional(),
  })
  .refine((set) => Boolean(set.exerciseId) !== Boolean(set.newExercise), {
    message: "Provide exactly one of exerciseId or newExercise",
  });

const sessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  bodyweight: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
  sets: z.array(setSchema).min(1),
});

export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date, bodyweight, notes, sets } = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const resolvedExerciseIds: string[] = [];
      for (const set of sets) {
        if (set.exerciseId) {
          resolvedExerciseIds.push(set.exerciseId);
        } else if (set.newExercise) {
          const exercise = await tx.exercise.upsert({
            where: { name: set.newExercise.name },
            update: {},
            create: {
              name: set.newExercise.name,
              category: set.newExercise.category,
            },
          });
          resolvedExerciseIds.push(exercise.id);
        }
      }

      const session = await tx.workoutSession.create({
        data: { date: new Date(date), bodyweight, notes },
      });

      await tx.setEntry.createMany({
        data: sets.map((set, index) => ({
          sessionId: session.id,
          exerciseId: resolvedExerciseIds[index],
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          order: index,
        })),
      });

      return session;
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    console.error("Failed to create workout session", err);
    return NextResponse.json(
      { error: "Failed to save session" },
      { status: 500 },
    );
  }
}
