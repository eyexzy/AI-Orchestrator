import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AI-Orchestrator — Adaptive AI UX",
  description:
    "Веб-чат з LLM, який адаптує інтерфейс під рівень досвіду користувача в реальному часі.",
  keywords: ["AI", "LLM", "Adaptive UX", "ChatGPT", "Claude", "Prompt Engineering"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className={`${inter.variable} dark`}>
      <body className="font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
