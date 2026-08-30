import { createAssistantEventParser } from "../../../features/assistant/sse";

const encoder = new TextEncoder();

export function createSanitizedAssistantStream(upstreamBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const parser = createAssistantEventParser((event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        parser.finish();
        controller.close();
      } catch (streamError) {
        controller.error(streamError);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
