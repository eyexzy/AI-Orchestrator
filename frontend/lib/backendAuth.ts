import { SignJWT } from "jose";

const authSecret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

export async function createBackendToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(authSecret);
}