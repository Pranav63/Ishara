import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LiquidCursor } from "@/components/LiquidCursor";
import { PreferencesProvider } from "@/components/Preferences";

export const metadata: Metadata = {
  title: "Ishara | إشارة",
  referrer: "no-referrer",
  description: "Finds a sign language interpreter for any appointment in Dubai, and replaces them if they cancel.",
};
export const viewport: Viewport = { themeColor: "#f7f7f5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PreferencesProvider><a className="skip" href="#main">Skip to content / انتقل إلى المحتوى</a>
        {children}<LiquidCursor /></PreferencesProvider>
      </body>
    </html>
  );
}
