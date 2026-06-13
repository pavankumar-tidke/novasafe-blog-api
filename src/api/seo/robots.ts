import { createHandler } from "@/lib/handler";
import { HTTP } from "@/lib/constants";
import { createSeoFeedsService } from "@/services/seo-feeds.service";

export default createHandler(
  async (_req, res, ctx) => {
    const feeds = createSeoFeedsService(ctx.config, ctx.repos!);
    const text = feeds.buildRobotsTxt();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(HTTP.OK).send(text);
  },
  { methods: ["GET"], mongo: true },
);
