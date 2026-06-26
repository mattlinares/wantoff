import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export function signToken(actorId: string): string {
  return jwt.sign({ sub: actorId }, JWT_SECRET, { expiresIn: "30d" });
}

export interface AuthedRequest extends Request {
  actorId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  try {
    const payload = jwt.verify(header.slice("Bearer ".length), JWT_SECRET);
    if (typeof payload === "string" || !payload.sub) {
      return res.status(401).json({ error: "invalid token" });
    }
    req.actorId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

// Like requireAuth, but proceeds (without req.actorId) if no/invalid token is present.
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice("Bearer ".length), JWT_SECRET);
      if (typeof payload !== "string" && payload.sub) {
        req.actorId = payload.sub;
      }
    } catch {
      // ignore invalid token, treat as anonymous
    }
  }
  next();
}
