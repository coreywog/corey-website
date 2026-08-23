import { Press_Start_2P } from "next/font/google";

const pixelFont = Press_Start_2P({ weight: "400", subsets: ["latin"] });

/**
 * Deliberately bare — this is what every visitor sees, logged in or not.
 * There's no link anywhere on the site to the real login page; it only
 * exists at its own unlisted path. See proxy.ts, which rewrites any
 * unauthenticated request for a gated route here too, so nothing ever
 * leaks the login path's existence via a redirect.
 */
export default function Home() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-black">
      <p className={`${pixelFont.className} text-xs tracking-wide text-white`}>
        work in progress
      </p>
    </div>
  );
}
