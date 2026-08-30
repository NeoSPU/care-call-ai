import { createCallbackRequestPostHandler, loadCallbackRequestConfig } from "./route-handler";

export const runtime = "nodejs";

export const POST = createCallbackRequestPostHandler({
  config: loadCallbackRequestConfig(),
  fetchUpstream: fetch,
});
