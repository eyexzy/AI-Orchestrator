"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
      <p className="text-sm text-ds-text-secondary">Something went wrong</p>
      <button
        type="button"
       
        onClick={reset}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        Try again
      </button>
    </div>
  );
}