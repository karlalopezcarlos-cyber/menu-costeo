"use client";

import { useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function IncomeStatementChat({
  initialCountId,
  finalCountId,
}: {
  initialCountId: string;
  finalCountId: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || pending) return;
    setError(null);
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setPending(true);
    scrollToBottom();

    try {
      const response = await fetch("/api/income-statement-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialCountId, finalCountId, messages: nextMessages }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo obtener respuesta.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
        scrollToBottom();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo obtener respuesta de la IA.");
      setMessages(nextMessages);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-700"
      >
        <span>Preguntar a la IA sobre este Estado de Resultados</span>
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-neutral-200 p-4">
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-sm text-neutral-500">
                Pregunta lo que quieras sobre este periodo, por ejemplo: &quot;¿por qué subió el costo de
                bebidas?&quot; o &quot;¿cómo se ve el negocio este periodo?&quot;
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "ml-8 bg-neutral-100 text-neutral-800"
                    : "mr-8 bg-blue-50 text-neutral-800"
                }`}
              >
                {m.content || (pending && i === messages.length - 1 ? "Pensando..." : "")}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="mt-3 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta..."
              disabled={pending}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
