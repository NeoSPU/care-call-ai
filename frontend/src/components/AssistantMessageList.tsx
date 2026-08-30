import type { ChatMessage, Suggestion } from "../features/assistant/types";

type AssistantMessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  suggestions: Suggestion[];
  onSuggestionClick: (query: string) => void;
};

export function AssistantMessageList({
  messages,
  isStreaming,
  suggestions,
  onSuggestionClick,
}: AssistantMessageListProps) {
  return (
    <div className="assistantMessageList">
      {messages.map((message) => (
        <div
          className={message.role === "user" ? "assistantRow userRow" : "assistantRow"}
          key={message.id}
        >
          <span className="assistantAvatar" aria-hidden="true">
            {message.role === "user" ? <UserIcon /> : <SparkleIcon />}
          </span>
          <div className="assistantBubble">
            <span className="senderName">{message.role === "user" ? "You" : "CareCall Assistant"}</span>
            <div className="messageText">
              {message.content ? formatMessageContent(message.content) : <span className="typingPulse">Thinking...</span>}
            </div>
          </div>
        </div>
      ))}

      {!isStreaming && messages.length <= 2 && (
        <div className="suggestions">
          <span className="suggestionsLabel">Suggested questions</span>
          <div className="suggestionList">
            {suggestions.map((suggestion) => (
              <button
                className="suggestionButton"
                key={suggestion.query}
                onClick={() => onSuggestionClick(suggestion.query)}
                type="button"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMessageContent(content: string) {
  return content.split("\n").map((line, index) => {
    if (!line.trim()) {
      return <br key={index} />;
    }
    if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      return (
        <p className="messageParagraph bulletPoint" key={index}>
          <span aria-hidden="true">•</span>
          {line.slice(2)}
        </p>
      );
    }
    return (
      <p className="messageParagraph" key={index}>
        {line}
      </p>
    );
  });
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4L12 3z" />
      <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}
