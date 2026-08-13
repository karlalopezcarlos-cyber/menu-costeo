import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { computeMenuEngineeringReport, type IvaMode } from "@/lib/menu-engineering";
import { buildMenuEngineeringContext, MENU_ENGINEERING_CHAT_SYSTEM_PROMPT } from "@/lib/menu-engineering-chat";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: NextRequest) {
  const user = await requireSucursalContext();

  const body = await request.json().catch(() => null);
  const from = body?.from;
  const to = body?.to;
  const iva = body?.iva;
  const messages = body?.messages;

  if (
    typeof from !== "string" ||
    typeof to !== "string" ||
    (iva !== "con" && iva !== "sin") ||
    !Array.isArray(messages)
  ) {
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

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Fechas invalidas." }, { status: 400 });
  }
  const ivaMode = iva as IvaMode;

  const [rows, sucursal] = await Promise.all([
    computeMenuEngineeringReport(user.sucursalId, fromDate, toDate, ivaMode),
    prisma.sucursal.findUnique({
      where: { id: user.sucursalId },
      select: { name: true, organization: { select: { name: true } } },
    }),
  ]);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No hay ventas capturadas para este periodo todavia, no hay nada que analizar." },
      { status: 400 },
    );
  }

  const context = buildMenuEngineeringContext(rows, {
    sucursalName: sucursal?.name ?? "Sucursal",
    organizationName: sucursal?.organization.name ?? "",
    fromLabel: fromDate.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    toLabel: toDate.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    ivaMode,
  });
  const systemPrompt = MENU_ENGINEERING_CHAT_SYSTEM_PROMPT(context);

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
        console.error("menu-engineering-chat error:", error);
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
