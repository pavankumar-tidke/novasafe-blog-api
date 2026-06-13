import { createHandler } from "@/lib/handler";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { HTTP } from "@/lib/constants";

export default createHandler(
  async (_req, res) => {
    sendJson(res, HTTP.OK, ok({ ready: true }));
  },
  { methods: ["GET"] },
);
