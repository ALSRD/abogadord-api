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
  const text = `Estoy funcionando en modo demo porque falta OPENAI_API_KEY.\n\nTu mensaje fue: "${prompt}"${sourceNote}\n\nCuando configures la variable de entorno, este endpoint transmitirá tokens reales desde OpenAI usando SSE.`;
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
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

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

  const input = ragContext
    ? `${evidenceInstruction}\n\nContexto documental recuperado por RAG:\n${ragContext}\n\nConversación:\n${recentContext}`
    : `${evidenceInstruction}\n\nConversación:\n${recentContext}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: systemPrompt,
      input,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    controller.enqueue(
      sendEvent("error", {
        message: "OpenAI no pudo generar la respuesta.",
        detail: errorText.slice(0, 500)
      })
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
      if (data === "[DONE]") continue;

      const parsed = JSON.parse(data) as { type?: string; delta?: string; text?: string; error?: { message?: string } };

      if (parsed.type === "response.output_text.delta" && parsed.delta) {
        controller.enqueue(sendEvent("token.delta", { text: parsed.delta }));
      }

      if (parsed.type === "response.completed") {
        controller.enqueue(sendEvent("message.completed", { model }));
      }

      if (parsed.type === "error" || parsed.error) {
        controller.enqueue(sendEvent("error", { message: parsed.error?.message || "Error de streaming." }));
      }
    }
  }
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatStreamBody;
  const messages = body.messages || [];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sendEvent("message.created", { at: new Date().toISOString() }));
      for (const citation of body.citations || []) {
        controller.enqueue(sendEvent("citation.added", citation));
      }
      streamOpenAIResponse(controller, messages, body.ragContext, body.hasEvidence)
        .catch((error: unknown) => {
          controller.enqueue(
            sendEvent("error", {
              message: error instanceof Error ? error.message : "Error inesperado en el stream."
            })
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
