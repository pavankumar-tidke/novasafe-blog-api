import { handle } from "hono/vercel";
import { app } from "@/app";

/** Bundled entry for Vercel — see scripts/build-api.mjs */
export default handle(app);
