import { handle } from "hono/vercel";
import { app } from "@/app";

/** Single serverless function — all /api/* routes (Hobby plan: max 12 functions). */
export default handle(app);
