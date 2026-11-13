import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { createActionGate } from "./action-gate.js";

export function Chat({ lobby, command, compact = false }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMessage] = useState(createActionGate);
  const draftVersion = useRef(0);
  const messages = useRef(null);
  const lastMessage = lobby.messages?.at(-1);
  useEffect(() => {
    const list = messages.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastMessage?.id]);

  return (
    <section className={`chat-panel ${compact ? "compact" : ""}`} aria-label="Lobby chat">
      <div className="panel-heading">
        <MessageSquare size={17} aria-hidden="true" />
        <h3>Chat</h3>
      </div>
      <div className="chat-messages" ref={messages} role="log" aria-label="Messages">
        {!lobby.messages?.length && <p className="chat-empty">No messages</p>}
        {lobby.messages?.map((message, i) => (
          <p key={message.id || i}>
            <strong>{message.name}</strong>
            <span>{message.text}</span>
          </p>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={async (event) => {
          event.preventDefault();
          const message = text.trim();
          if (!message) return;
          await sendMessage(async () => {
            const version = draftVersion.current;
            setSending(true);
            try {
              // A delayed acknowledgement belongs to the sent draft, not text typed meanwhile.
              if (await command("chat", { text: message })) {
                if (draftVersion.current === version) setText("");
              }
            } finally {
              setSending(false);
            }
          });
        }}
      >
        <input
          aria-label="Message"
          placeholder="Message…"
          value={text}
          maxLength={300}
          onChange={(event) => { draftVersion.current++; setText(event.target.value); }}
        />
        <button type="submit" aria-label={sending ? "Sending message" : "Send message"} disabled={sending || !text.trim()}>
          <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
