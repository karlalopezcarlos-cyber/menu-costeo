"use client";

import { useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function MenuEngineeringChatDialog({
  from,
  to,
  iva,
}: {
  from: string;
  to: string;
  iva: "con" | "sin";
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
      const response = await fetch("/api/menu-engineering-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, iva, messages: nextMessages }),
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Consultar con IA
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">
                Consultar con IA sobre lo filtrado
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-neutral-400 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="text-sm text-neutral-500">
                  Pregunta lo que quieras sobre los platillos que estan filtrados en pantalla ahorita
                  (mismo periodo y modo de IVA), por ejemplo: &quot;¿que platillos deberia
                  promover?&quot; o &quot;¿cual me esta quitando margen?&quot;
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "ml-8 bg-neutral-100 text-neutral-800" : "mr-8 bg-blue-50 text-neutral-800"
                  }`}
                >
                  {m.content || (pending && i === messages.length - 1 ? "Pensando..." : "")}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {error && <p className="px-4 text-sm text-red-600">{error}</p>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex gap-2 border-t border-neutral-200 p-4"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta..."
                disabled={pending}
                autoFocus
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
        </div>
      )}
    </>
  );
}
