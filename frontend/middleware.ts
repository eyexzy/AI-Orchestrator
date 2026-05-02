export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/", "/login", "/chat", "/dashboard", "/profile", "/settings", "/admin", "/projects/:path*"],
};
