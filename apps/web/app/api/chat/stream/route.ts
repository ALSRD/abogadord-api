import type { ChatMessage, MessageCitation } from "@/lib/chat";

export const runtime = "edge";

const encoder = new TextEncoder();

const sendEvent = (event: string, data: unknown) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const systemPrompt = `Eres AbogadoRD AI, un asistente jurídico profesional de República Dominicana.
Responde en español, con tono claro y humano. Usa Markdown cuando mejore la lectura.
Si usas contexto documental, cita las fuentes por nombre de documento y página cuando estén disponibles.
Control de alucinaciones: si el contexto documental no contiene evidencia suficiente para responder, dilo explícitamente y pide el documento o dato faltante. No inventes leyes, citas, jurisprudencia ni fuentes.`;

type ChatStreamBody = {
  citations?: MessageCitation[];
  messages?: ChatMessage[];
  hasEvidence?: boolean;
  ragContext?: string;
};

const fallbackResponse = async (controller: ReadableStreamDefaultController<Uint8Array>, prompt: string, ragContext?: string) => {
  const sourceNote = ragContext ? "\n\nDetecté contexto documental adjunto y lo usaría como base de la respuesta en modo producción." : "";
  const text = `Estoy funcionando en modo demo porque falta OPENAI_API_KEY.\n\nTu mensaje fue: "${prompt}"${sourceNote}\n\nCuando configures la variable de entorno, este endpoint transmitirá tokens reales desde OpenAI/OpenRouter usando SSE.`;
  for (const token of text.split(/(\s+)/)) {
    controller.enqueue(sendEvent("token.delta", { text: token }));
    await sleep(18);
  }
  controller.enqueue(sendEvent("message.completed", { demo: true }));
};

const streamOpenAIResponse = async (
  controller: ReadableStreamDefaultController<Uint8Array>,
  messages: ChatMessage[],
  ragContext?: string,
  hasEvidence = false
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    await fallbackResponse(controller, lastUserMessage?.content || "", ragContext);
    return;
  }

  const recentContext = messages
    .slice(-12)
    .map((message) => `${message.role === "user" ? "Usuario" : "Asistente"}: ${message.content}`)
    .join("\n\n");

  const evidenceInstruction = ragContext
    ? hasEvidence
      ? "Usa el contexto documental como evidencia principal y conserva las citas."
      : "El retrieval no encontró evidencia documental suficientemente fuerte; responde con cautela y declara esa limitación."
    : "No hay contexto documental recuperado para esta respuesta.";

  const userContent = ragContext
    ? `${evidenceInstruction}\n\nContexto documental recuperado por RAG:\n${ragContext}\n\nConversación:\n${recentContext}`
    : `${evidenceInstruction}\n\nConversación:\n${recentContext}`;

  const chatMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  const extraHeaders: Record<string, string> = {};
  if (baseUrl.includes("openrouter.ai")) {
    extraHeaders["HTTP-Referer"] = "https://abogadord-api.vercel.app";
    extraHeaders["X-Title"] = "AbogadoRD";
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    controller.enqueue(
      sendEvent("error", { message: "El proveedor de IA no pudo generar la respuesta.", detail: errorText.slice(0, 500) })
    );
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const data = dataLine.slice(6);
      if (data === "[DONE]") {
        controller.enqueue(sendEvent("message.completed", { model }));
        continue;
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
          error?: { message?: string };
        };
        if (parsed.error) {
          controller.enqueue(sendEvent("error", { message: parsed.error.message || "Error de streaming." }));
          continue;
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          controller.enqueue(sendEvent("token.delta", { text: delta }));
        }
        if (parsed.choices?.[0]?.finish_reason === "stop") {
          controller.enqueue(sendEvent("message.completed", { model }));
        }
      } catch {
        // skip malformed events
      }
    }
  }
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatStreamBody;
  const messages = body.messages || [];

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sendEvent("message.created", { at: new Date().toISOString() }));

      for (const citation of body.citations || []) {
        controller.enqueue(sendEvent("citation.added", citation));
      }

      streamOpenAIResponse(controller, messages, body.ragContext, body.hasEvidence)
        .catch((error: unknown) => {
          controller.enqueue(
            sendEvent("error", { message: error instanceof Error ? error.message : "Error inesperado en el stream." })
          );
        })
        .finally(() => controller.close());
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}
