import { createSupportPostHandler, loadSupportConfig } from "./route-handler";

export const runtime = "nodejs";

export const POST = createSupportPostHandler({
  config: loadSupportConfig(),
  fetchUpstream: fetch,
});
