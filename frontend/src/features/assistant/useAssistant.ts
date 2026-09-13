"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SUGGESTIONS, streamAssistantResponse } from "./client";
import type { AssistantStatus, ChatMessage } from "./types";

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello. I am the CareCall AI assistant. I can help explain call rounds, safety boundaries, recipient workflow, and service-request preparation.",
  timestamp: Date.now(),
};

export function useAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [status, setStatus] = useState<AssistantStatus>("idle");

  const messagesRef = useRef(messages);
  const statusRef = useRef(status);
  const abortControllerRef = useRef<AbortController | null>(null);
  const voiceMessageIdsRef = useRef<Partial<Record<ChatMessage["role"], string>>>({});

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const sendMessage = useCallback(async (text: string): Promise<string> => {
    const trimmed = text.trim();
    if (!trimmed || statusRef.current === "thinking" || statusRef.current === "streaming") {
      return "";
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const nextMessages = [...messagesRef.current, userMsg];
    setMessages([...nextMessages, assistantMsg]);
    setStatus("thinking");

    abortControllerRef.current = new AbortController();
    let fullAssistantContent = "";

    try {
      await streamAssistantResponse({
        messages: nextMessages,
        signal: abortControllerRef.current.signal,
        onChunk: (chunk) => {
          fullAssistantContent += chunk;
          setStatus("streaming");
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantMsgId
                ? { ...message, content: message.content + chunk }
                : message,
            ),
          );
        },
      });
      return fullAssistantContent;
    } catch {
      setStatus("error");
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMsgId
            ? {
                ...message,
                content:
                  "The assistant service is not available right now. Please continue using the CareCall dashboard and contact support if this continues.",
              }
            : message,
        ),
      );
      return "";
    } finally {
      setStatus("idle");
      abortControllerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    cancel();
    setMessages([{ ...INITIAL_WELCOME_MESSAGE, timestamp: Date.now() }]);
    voiceMessageIdsRef.current = {};
  }, [cancel]);

  const appendVoiceTranscript = useCallback((role: ChatMessage["role"], text: string) => {
    const transcript = text.trim();
    if (!transcript) {
      return;
    }
    const activeMessageId = voiceMessageIdsRef.current[role];
    if (activeMessageId) {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === activeMessageId
            ? { ...message, content: `${message.content}${text}` }
            : message,
        ),
      );
      return;
    }

    const messageId = `voice-${role}-${Date.now()}`;
    voiceMessageIdsRef.current[role] = messageId;
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: messageId, role, content: text, timestamp: Date.now() },
    ]);
  }, []);

  const completeVoiceTurn = useCallback(() => {
    voiceMessageIdsRef.current = {};
  }, []);

  return {
    messages,
    status,
    isStreaming: status === "thinking" || status === "streaming",
    suggestions: DEFAULT_SUGGESTIONS,
    sendMessage,
    cancel,
    reset,
    appendVoiceTranscript,
    completeVoiceTurn,
  };
}
