import type { VercelRequest } from "@vercel/node";
import type { AppConfig } from "@/types/config";
import type { AdminContext } from "@/types/auth";
import { UnauthorizedError } from "@/lib/errors";
import { extractBearerToken, verifyAccessToken } from "@/lib/jwt";

export { extractBearerToken };

export async function verifyAdmin(
  req: VercelRequest,
  config: AppConfig,
): Promise<AdminContext> {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(
    typeof authHeader === "string" ? authHeader : authHeader?.[0],
  );

  if (!token) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const result = await verifyAccessToken(config, token);
  if (!result.valid) {
    const message =
      result.reason === "expired" ? "Access token expired" : "Invalid access token";
    throw new UnauthorizedError(message);
  }

  return {
    id: result.claims.sub,
    email: result.claims.email,
    role: result.claims.role,
  };
}

export async function isAdminRequest(
  req: VercelRequest,
  config: AppConfig,
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(
    typeof authHeader === "string" ? authHeader : authHeader?.[0],
  );
  if (!token) return false;
  const result = await verifyAccessToken(config, token);
  return result.valid;
}
