"use client";

import { useEffect, useState } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/store/i18nStore";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type EmailForm = z.infer<typeof emailSchema>;

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function getAuthErrorMessage(error: string | null, t: (key: string) => string): string | null {
  if (!error) return null;
  switch (error) {
    case "OAuthAccountNotLinked":
      return t("login.errorAccountNotLinked");
    case "Configuration":
      return t("login.errorConfiguration");
    case "AccessDenied":
      return t("login.errorAccessDenied");
    case "OAuthCallbackError":
      return t("login.errorCallback");
    default:
      return t("login.errorGeneric");
  }
}

export default function LoginPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const isVerify = searchParams.get("verify") === "1";
  const authError = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/chat";

  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<Set<string> | null>(null);
  const [emailSent, setEmailSent] = useState(isVerify);
  const [emailError, setEmailError] = useState<string | null>(
    getAuthErrorMessage(authError, t),
  );

  const isOAuthLoading = isGitHubLoading || isGoogleLoading;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
  });

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/auth/providers", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load auth providers");
        }

        const data = (await res.json()) as Record<string, unknown>;
        if (!cancelled) {
          setAvailableProviders(new Set(Object.keys(data ?? {})));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableProviders(new Set(["github", "resend"]));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGitHub = async () => {
    setIsGitHubLoading(true);
    await signIn("github", { callbackUrl });
  };

  const handleGoogle = async () => {
    setIsGoogleLoading(true);
    await signIn("google", { callbackUrl });
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
        setEmailError(t("login.errorEmailSend"));
        setIsEmailLoading(false);
      } else if (res?.ok) {
        setEmailSent(true);
      } else {
        setIsEmailLoading(false);
      }
    } catch {
      setEmailError(t("login.errorEmailGeneric"));
      setIsEmailLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
            <CheckCircle2 size={48} strokeWidth={2} className="text-green-700" />
            <div>
              <h2 className="text-base font-semibold text-ds-text">{t("login.checkEmail")}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ds-text-secondary">
                {t("login.checkEmailDescription")}
              </p>
            </div>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setEmailSent(false)}
            >
              {t("login.tryDifferentMethod")}
            </Button>
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
          <h1 className="text-lg font-semibold tracking-tight text-ds-text">
            AI&#8209;Orchestrator
          </h1>
          <p className="mt-1 text-[15px] text-ds-text-secondary">
            {t("login.subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-base">{t("login.title")}</CardTitle>
            <CardDescription className="text-sm">
              {t("login.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error banner */}
            {emailError && (
              <div className="rounded-lg border border-red-300 bg-red-100 px-3 py-2.5">
                <p className="text-sm leading-relaxed text-red-700">{emailError}</p>
              </div>
            )}

            {/* OAuth providers */}
            <div className="flex flex-col gap-2.5">
              {availableProviders?.has("github") && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleGitHub}
                  disabled={isOAuthLoading}
                  isLoading={isGitHubLoading}
                  leftIcon={!isGitHubLoading ? <GitHubIcon /> : undefined}
                >
                  {t("login.withGitHub")}
                </Button>
              )}

              {availableProviders?.has("google") && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleGoogle}
                  disabled={isOAuthLoading}
                  isLoading={isGoogleLoading}
                  leftIcon={!isGoogleLoading ? <GoogleIcon /> : undefined}
                >
                  {t("login.withGoogle")}
                </Button>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-ds-text-tertiary">{t("login.or")}</span>
              <Separator className="flex-1" />
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit(handleEmail)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("settings.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  autoComplete="email"
                  variant="default"
                  size="md"
                  inputClassName="text-base"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-red-700">{errors.email.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isEmailLoading}
                isLoading={isEmailLoading}
                leftIcon={!isEmailLoading ? <Mail size={16} strokeWidth={2} /> : undefined}
              >
                {t("login.withEmail")}
              </Button>
            </form>

            <p className="pt-2 text-center text-xs leading-relaxed text-ds-text-tertiary">
              {t("login.hint")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
