"use client";

import { FormEvent, useState } from "react";

import { PublicPageShell } from "../../components/PublicPageShell";

const MAX_MESSAGE_LENGTH = 1200;

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSafeText(value: string) {
  return !/[<>]/.test(value);
}

export default function SupportPage() {
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();

    if (!name || !email || !message) {
      setStatus("Please complete all fields.");
      return;
    }
    if (!isLikelyEmail(email)) {
      setStatus("Please enter a valid email address.");
      return;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      setStatus("Please shorten the message before sending.");
      return;
    }
    if (![name, email, message].every(isSafeText)) {
      setStatus("Please remove angle brackets from the form.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Sending support request.");
    try {
      const response = await fetch("/api/support", {
        body: JSON.stringify({ email, message, name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "The support request could not be sent. Please try again later.");
        return;
      }
      setStatus("Support request sent. Thank you.");
      formElement.reset();
    } catch {
      setStatus("The support request could not be sent. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PublicPageShell panelClassName="supportPanel">
        <p className="landingKicker">Support</p>
        <h1>Contact CareCall AI Support</h1>
        <p>
          Send a short message to the project owner. Do not include medical records,
          passwords, payment details, or emergency requests in this form.
        </p>
        <form className="supportForm" noValidate onSubmit={handleSubmit}>
          <label>
            From
            <input autoComplete="name" maxLength={120} name="name" required />
          </label>
          <label>
            Email address
            <input autoComplete="email" inputMode="email" maxLength={160} name="email" required type="email" />
          </label>
          <label>
            Message
            <textarea maxLength={MAX_MESSAGE_LENGTH} name="message" required rows={7} />
          </label>
          <button className="button landingPrimary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Sending..." : "Send support request"}
          </button>
        </form>
        {status ? <p className="formStatus" role="status">{status}</p> : null}
    </PublicPageShell>
  );
}
