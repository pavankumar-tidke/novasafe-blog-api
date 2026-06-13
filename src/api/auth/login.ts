import { createHandler } from "@/lib/handler";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { parseBody } from "@/lib/validation";
import { HTTP } from "@/lib/constants";
import { loginBodySchema } from "@/schemas/auth.schema";
import { createAuthService } from "@/services/auth.service";

export default createHandler(
  async (req, res, ctx) => {
    const input = await parseBody(req, loginBodySchema);
    const auth = createAuthService(ctx.config);
    const result = await auth.login(input);
    sendJson(res, HTTP.OK, ok(result));
  },
  { methods: ["POST"] },
);
