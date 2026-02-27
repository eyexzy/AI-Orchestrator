"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const emailSchema = z.object({
  email: z.string().email("Введіть коректну email адресу"),
});

type EmailForm = z.infer<typeof emailSchema>;

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const isVerify = searchParams.get("verify") === "1";
  const authError = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(isVerify);
  const [emailError, setEmailError] = useState<string | null>(
    authError === "Configuration"
      ? "Не вдалося відправити лист. Використовуйте GitHub або перевірте email."
      : null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
  });

  const handleGitHub = async () => {
    setIsGitHubLoading(true);
    await signIn("github", { callbackUrl });
  };

  const handleEmail = async (data: EmailForm) => {
    setIsEmailLoading(true);
    setEmailError(null);
    try {
      const res = await signIn("resend", {
        email: data.email,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setEmailError(
          "Не вдалося відправити лист. У тестовому режимі Resend дозволяє надсилати листи лише на email власника акаунту. Використайте GitHub для входу.",
        );
        setIsEmailLoading(false);
      } else if (res?.ok) {
        setEmailSent(true);
      } else {
        setIsEmailLoading(false);
      }
    } catch {
      setEmailError("Виникла помилка при відправці листа.");
      setIsEmailLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
            <CheckIcon />
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Перевірте вашу пошту</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Ми надіслали вам магічне посилання для входу.
                <br />
                Натисніть на нього, щоб увійти.
              </p>
            </div>
            <button
              onClick={() => setEmailSent(false)}
              className="mt-2 text-[12px] text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              Спробувати інший спосіб
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            AI&#8209;Orchestrator
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Адаптивний веб-чат з ШІ
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-[15px]">Увійти в акаунт</CardTitle>
            <CardDescription className="text-[12px]">
              Оберіть спосіб автентифікації
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error banner */}
            {emailError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5">
                <p className="text-[12px] leading-relaxed text-red-300/90">{emailError}</p>
              </div>
            )}

            {/* GitHub */}
            <Button
              variant="outline"
              className="w-full gap-2.5"
              onClick={handleGitHub}
              disabled={isGitHubLoading}
            >
              {isGitHubLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <GitHubIcon />
              )}
              Увійти через GitHub
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="text-[11px] text-muted-foreground/50">або</span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit(handleEmail)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  autoComplete="email"
                  className="flex h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-white/[0.15] focus:bg-white/[0.06] focus:ring-1 focus:ring-primary/30"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-[11px] text-destructive">{errors.email.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full gap-2" disabled={isEmailLoading}>
                {isEmailLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <MailIcon />
                )}
                Увійти через Email
              </Button>
            </form>

            <p className="pt-2 text-center text-[11px] leading-relaxed text-muted-foreground/40">
              Рекомендуємо вхід через GitHub — він працює без обмежень.
              <br />
              Email-вхід у тестовому режимі обмежений.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
