import type { Metadata, Viewport } from "next";
import { Stack_Sans_Headline, Stack_Sans_Text } from "next/font/google";
import { headers } from "next/headers";
import { MotionProvider } from "@/components/ui/motion-provider";
import "./globals.css";

const display = Stack_Sans_Headline({
  variable: "--font-stack-headline",
  weight: ["300", "400"],
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const text = Stack_Sans_Text({
  variable: "--font-stack-text",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Chromafy | The world, in another light",
    template: "%s | Chromafy",
  },
  description:
    "Upload an ordinary photo, choose a world and see the same moment in another light. Keep the moment. Change the feeling.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fbf8f2",
  colorScheme: "light",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the request headers makes every page render per request, which the
  // nonce-based Content-Security-Policy set in src/proxy.ts requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`${display.variable} ${text.variable} antialiased`}>
      <body className="min-h-dvh bg-paper text-ink">
        <MotionProvider nonce={nonce}>{children}</MotionProvider>
      </body>
    </html>
  );
}
