import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireSucursalContext } from "@/lib/tenant";
import { computeIncomeStatement, buildIncomeStatementRows } from "@/lib/income-statement";
import { buildIncomeStatementContext, INCOME_STATEMENT_CHAT_SYSTEM_PROMPT } from "@/lib/income-statement-chat";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: NextRequest) {
  const user = await requireSucursalContext();

  const body = await request.json().catch(() => null);
  const initialCountId = body?.initialCountId;
  const finalCountId = body?.finalCountId;
  const messages = body?.messages;

  if (typeof initialCountId !== "string" || typeof finalCountId !== "string" || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  }

  const cleanMessages: ChatMessage[] = messages
    .filter(
      (m): m is ChatMessage =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

  if (cleanMessages.length === 0 || cleanMessages[cleanMessages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Falta el mensaje del usuario." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "La IA no esta configurada todavia (falta ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  let result;
  try {
    result = await computeIncomeStatement(user.organizationId, user.sucursalId, initialCountId, finalCountId);
  } catch {
    return NextResponse.json({ error: "No se pudo cargar el Estado de Resultados." }, { status: 400 });
  }

  const rows = buildIncomeStatementRows(result);
  const context = buildIncomeStatementContext(result, rows);
  const systemPrompt = INCOME_STATEMENT_CHAT_SYSTEM_PROMPT(context);

  const client = new Anthropic();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const anthropicStream = client.messages.stream({
          model: "claude-opus-5",
          max_tokens: 2048,
          system: systemPrompt,
          messages: cleanMessages,
        });
        anthropicStream.on("text", (text) => {
          controller.enqueue(encoder.encode(text));
        });
        await anthropicStream.finalMessage();
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            "\n\n[No se pudo obtener respuesta de la IA en este momento. Intenta de nuevo en unos segundos.]",
          ),
        );
        console.error("income-statement-chat error:", error);
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
