"use client";

import { useState } from "react";

type SubmitState = "idle" | "sending" | "sent" | "failed";

export function SupportForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  async function submitSupport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          message: formData.get("message"),
          company: formData.get("company"),
        }),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        setState("failed");
        setMessage("The service could not send this message. Please try again later.");
        return;
      }
      setState("sent");
      setMessage("Support message received. Thank you.");
      form.reset();
    } catch {
      setState("failed");
      setMessage("The service could not send this message. Please try again later.");
    }
  }

  return (
    <form className="supportForm" onSubmit={submitSupport}>
      <label>
        <span>Your name</span>
        <input autoComplete="name" maxLength={80} name="name" required />
      </label>
      <label>
        <span>Email address</span>
        <input autoComplete="email" maxLength={120} name="email" required type="email" />
      </label>
      <label className="hiddenField" aria-hidden="true">
        <span>Company</span>
        <input autoComplete="off" name="company" tabIndex={-1} />
      </label>
      <label>
        <span>Message</span>
        <textarea maxLength={1500} minLength={10} name="message" required rows={8} />
      </label>
      <button className="button" disabled={state === "sending"} type="submit">
        {state === "sending" ? "Sending" : "Send support message"}
      </button>
      {message && <p className={state === "failed" ? "errorText" : "resultBox"} role="status">{message}</p>}
    </form>
  );
}
