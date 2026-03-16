import { SignJWT } from "jose";

export async function createBackendToken(email: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secret);
}