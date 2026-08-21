import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SupportForm } from "./SupportForm";

describe("SupportForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits sanitized support fields through the server route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SupportForm />);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Max Neous" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "max@example.com" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help me access the demo." } });
    fireEvent.click(screen.getByRole("button", { name: "Send support message" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/support", expect.any(Object)));
    expect(await screen.findByText("Support message received. Thank you.")).toBeTruthy();
  });
});
