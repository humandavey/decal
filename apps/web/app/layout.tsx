import type { Metadata } from "next";
// Self-hosted via @fontsource instead of next/font/google — see the
// comment above the --font-* variables in globals.css for why. Only the
// specific weights/styles actually used across the app are imported, to
// keep the bundle lean (matches the weight lists the old next/font/google
// config declared).
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/500-italic.css";
import "@fontsource/fraunces/600-italic.css";
import "@fontsource/fraunces/700-italic.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decal — family calendar",
  description: "A self-hosted family calendar dashboard."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
