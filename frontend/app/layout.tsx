import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SessionProvider } from "@/components/SessionProvider";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "AI-Orchestrator — Adaptive AI UX",
  description:
    "An LLM web chat that adapts the interface to the user's experience level in real time.",
  keywords: ["AI", "LLM", "Adaptive UX", "ChatGPT", "Claude", "Prompt Engineering"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Toaster position="bottom-right" />
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}