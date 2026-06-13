import { createHandler } from "@/lib/handler";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { HTTP } from "@/lib/constants";

export default createHandler(
  async (_req, res, ctx) => {
    sendJson(res, HTTP.OK, ok({ admin: ctx.admin }));
  },
  { methods: ["GET"], auth: true },
);
