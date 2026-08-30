"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { VoiceController, type VoiceState } from "../features/assistant/voice";
import { useAssistant } from "../features/assistant/useAssistant";
import { AssistantMessageList } from "./AssistantMessageList";

export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceStatus, setVoiceStatus] = useState("Voice off");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const voiceControllerRef = useRef<VoiceController | null>(null);

  const {
    messages,
    isStreaming,
    suggestions,
    sendMessage,
    reset,
    appendVoiceTranscript,
    completeVoiceTurn,
  } = useAssistant();

  useEffect(() => {
    voiceControllerRef.current = new VoiceController({
      onState: (state, status) => {
        setVoiceState(state);
        setVoiceStatus(status);
      },
      onTranscript: appendVoiceTranscript,
      onTurnComplete: completeVoiceTurn,
      onError: (message) => setVoiceStatus(message),
    });

    return () => {
      void voiceControllerRef.current?.stop();
    };
  }, [appendVoiceTranscript, completeVoiceTurn]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      void voiceControllerRef.current?.stop();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = input.trim();
    if (!query || isStreaming) {
      return;
    }
    setInput("");
    void sendMessage(query);
  }

  function handleSuggestionClick(query: string) {
    if (!isStreaming) {
      void sendMessage(query);
    }
  }

  async function toggleVoice() {
    if (voiceState !== "idle") {
      await voiceControllerRef.current?.stop();
      return;
    }
    const locale = navigator.language?.startsWith("ru") ? "ru-RU" : "en-GB";
    await voiceControllerRef.current?.start(locale);
  }

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close CareCall assistant" : "Open CareCall assistant"}
        className={isOpen ? "aiFab open" : "aiFab"}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <SparkleIcon />
        <span className="aiBadge">AI</span>
      </button>

      <aside className={isOpen ? "aiPanel open" : "aiPanel"} aria-label="CareCall AI assistant">
        <div className="aiHead">
          <div className="aiAv" aria-hidden="true">
            <SparkleIcon />
          </div>
          <div>
            <h3>CareCall Assistant</h3>
            <p>{voiceState !== "idle" ? voiceStatus : "Secure care operations guide"}</p>
          </div>
          <div className="aiHeadActions">
            <button aria-label="Reset assistant conversation" className="iconButton" onClick={reset} type="button">
              <ResetIcon />
            </button>
            <button aria-label="Close assistant" className="iconButton" onClick={() => setIsOpen(false)} type="button">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="aiMsgs">
          <AssistantMessageList
            messages={messages}
            isStreaming={isStreaming}
            suggestions={suggestions}
            onSuggestionClick={handleSuggestionClick}
          />
          <div ref={messagesEndRef} />
        </div>

        <form className="aiInput" onSubmit={handleSubmit}>
          <button
            aria-label={voiceState !== "idle" ? "Stop voice assistant" : "Start voice assistant"}
            className={voiceState !== "idle" ? "voiceButton active" : "voiceButton"}
            onClick={toggleVoice}
            title={voiceState !== "idle" ? "Voice active. Click to stop." : "Start voice assistant"}
            type="button"
          >
            {voiceState !== "idle" ? <MicOffIcon /> : <MicIcon />}
          </button>
          <input
            aria-label="Ask CareCall assistant"
            disabled={isStreaming || voiceState !== "idle"}
            onChange={(event) => setInput(event.target.value)}
            placeholder={voiceState !== "idle" ? "Voice session active..." : "Ask about CareCall operations..."}
            ref={inputRef}
            value={input}
          />
          <button aria-label="Send assistant message" className="aiSend" disabled={!input.trim() || isStreaming} type="submit">
            <SendIcon />
          </button>
        </form>
      </aside>
    </>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4L12 3z" />
      <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2 2 20 20" />
      <path d="M9 9v3a3 3 0 0 0 5.1 2.1" />
      <path d="M15 9.3V5a3 3 0 0 0-5.6-1.5" />
      <path d="M19 10v2a7 7 0 0 1-.7 3" />
      <path d="M5 10v2a7 7 0 0 0 10.4 6.1" />
      <path d="M12 19v3" />
    </svg>
  );
}
