import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

// Reuses the same source image apps/mobile/assets/logo.png feeds into
// `npx @capacitor/assets generate` for the native app icons, instead of a
// second copy of the logo living only here — see the "App icon / splash
// screen" note in apps/mobile/README.md. ImageResponse rasterizes it down
// to `size` below (that logo is meant to be at least 1024x1024 for the
// native tooling — way bigger than a favicon needs, hence resizing here
// rather than serving it as-is).
//
// process.cwd() is apps/web both in dev (`next dev` runs from here) and in
// production (docker-entrypoint.sh's `pnpm --filter @decal/web start` runs
// with this package's directory as cwd — how pnpm --filter always works),
// so this path resolves the same way in both. The Dockerfile's `COPY . .`
// brings the whole monorepo into the image, and .dockerignore only
// excludes apps/mobile's generated ios/ and android/ folders, not
// assets/, so the source file is actually present at runtime, not just in
// local dev.
const LOGO_PATH = path.join(process.cwd(), "..", "mobile", "assets", "logo.png");

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  try {
    const file = await readFile(LOGO_PATH);
    const dataUri = `data:image/png;base64,${file.toString("base64")}`;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {/* ImageResponse (satori) needs a plain <img>, not next/image —
              it rasterizes this JSX itself, next/image's client-side
              behavior doesn't apply here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri} width={size.width} height={size.height} alt="" />
        </div>
      ),
      { ...size }
    );
  } catch {
    // apps/mobile/assets/logo.png doesn't exist yet (see
    // apps/mobile/README.md's "App icon / splash screen") — a plain
    // lettermark in the app's own accent color beats a broken favicon in
    // the meantime. Swap out automatically the moment that file shows up,
    // no code change needed.
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f0633d",
            color: "#14171d",
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "sans-serif"
          }}
        >
          D
        </div>
      ),
      { ...size }
    );
  }
}
