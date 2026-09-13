import { describe, expect, it } from "vitest";

import { createAssistantEventParser } from "./sse";

describe("createAssistantEventParser", () => {
  it("emits only supported assistant stream events", async () => {
    const chunks = [
      'data: {"type":"delta","text":"Hello"}\n\n',
      'data: {"type":"unknown","secret":"ignored"}\n\n',
      'data: {"type":"done","abstained":false}\n\n',
    ];
    const events = [];
    const parser = createAssistantEventParser((event) => events.push(event));

    for (const chunk of chunks) {
      parser.push(chunk);
    }
    parser.finish();

    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "done", abstained: false },
    ]);
  });
});
