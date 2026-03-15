"use client";

import { useState } from "react";
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
      ? "Failed to send the email. Please use GitHub or check your email address."
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
          "Failed to send the email. In test mode, Resend only allows sending to the account owner's email. Please use GitHub to sign in.",
        );
        setIsEmailLoading(false);
      } else if (res?.ok) {
        setEmailSent(true);
      } else {
        setIsEmailLoading(false);
      }
    } catch {
      setEmailError("An error occurred while sending the email.");
      setIsEmailLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
            <CheckCircle2 size={48} strokeWidth={2} className="text-geist-success" />
            <div>
              <h2 className="text-base font-semibold text-ds-text">Check your email</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ds-text-secondary">
                We sent you a magic link to sign in.
                <br />
                Click the link in your email to continue.
              </p>
            </div>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setEmailSent(false)}
            >
              Try a different method
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
            Adaptive AI Web Chat
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-base">Sign in to your account</CardTitle>
            <CardDescription className="text-sm">
              Choose your authentication method
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error banner */}
            {emailError && (
              <div className="rounded-lg border border-geist-error/20 bg-geist-error/[0.08] px-3 py-2.5">
                <p className="text-sm leading-relaxed text-geist-error">{emailError}</p>
              </div>
            )}

            {/* GitHub */}
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleGitHub}
              disabled={isGitHubLoading}
              isLoading={isGitHubLoading}
              leftIcon={!isGitHubLoading ? <GitHubIcon /> : undefined}
            >
              Sign in with GitHub
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-alpha-200" />
              <span className="text-xs text-ds-text-tertiary">or</span>
              <div className="h-px flex-1 bg-gray-alpha-200" />
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit(handleEmail)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
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
                  <p className="text-xs text-geist-error">{errors.email.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isEmailLoading}
                isLoading={isEmailLoading}
                leftIcon={!isEmailLoading ? <Mail size={16} strokeWidth={2} /> : undefined}
              >
                Sign in with Email
              </Button>
            </form>

            <p className="pt-2 text-center text-xs leading-relaxed text-ds-text-tertiary">
              We recommend signing in via GitHub — it works without limitations.
              <br />
              Email sign-in is limited in test mode.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
