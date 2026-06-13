import { createHandler } from "@/lib/handler";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { HTTP } from "@/lib/constants";
import type { HealthResponse } from "@/types/api";

export default createHandler(
  async (_req, res, ctx) => {
    const body: HealthResponse = {
      status: "ok",
      environment: ctx.config.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    };
    sendJson(res, HTTP.OK, ok(body));
  },
  { methods: ["GET"] },
);
