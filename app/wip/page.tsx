import { Press_Start_2P } from "next/font/google";

const pixelFont = Press_Start_2P({ weight: "400", subsets: ["latin"] });

/**
 * Bare placeholder shown to logged-out visitors while the site's under
 * construction — see proxy.ts, which rewrites every unauthenticated
 * request here instead of the usual /login redirect.
 */
export default function WipPage() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-black">
      <p className={`${pixelFont.className} text-xs tracking-wide text-white`}>
        work in progress
      </p>
    </div>
  );
}
