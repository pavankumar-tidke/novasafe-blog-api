import { createHandler } from "@/lib/handler";
import { HTTP } from "@/lib/constants";
import { createSeoFeedsService } from "@/services/seo-feeds.service";

export default createHandler(
  async (_req, res, ctx) => {
    const feeds = createSeoFeedsService(ctx.config, ctx.repos!);
    const xml = await feeds.buildSitemapXml();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(HTTP.OK).send(xml);
  },
  { methods: ["GET"], mongo: true },
);
