if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PUBLIC_API_URL
) {
  throw new Error(
    "[config] NEXT_PUBLIC_API_URL is required in production. " +
      "Set it in your environment variables (e.g. NEXT_PUBLIC_API_URL=https://api.example.com)."
  );
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");