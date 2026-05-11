"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { MarkdownMessage } from "@/components/markdown-message";
import { Button } from "@/components/ui/button";
import {
  createRemoteConversation,
  fetchAnalyticsSummary,
  fetchDocuments,
  fetchRemoteConversations,
  fetchRemoteMessages,
  fetchReviewQueue,
  getClientUserId,
  persistRemoteMessage,
  searchRag,
  submitMessageFeedback,
  updateRemoteConversationTitle,
  uploadDocument,
  type AnalyticsSummary,
  type ClientIdentity,
  type DocumentSummary,
  type ReviewQueueItem
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ChatMessage, Conversation, MessageCitation, createConversation, createId, titleFromMessage } from "@/lib/chat";

const storageKey = "abogadord-chat-conversations";

type PersistenceMode = "local" | "cloud" | "syncing";

const starterPrompts = [
  "Explícame una medida de coerción en República Dominicana",
  "Redacta una estructura base de instancia procesal",
  "Resume los riesgos legales de un contrato simple"
];

function parseSseChunk(chunk: string) {
  return chunk
    .split("\n\n")
    .map((eventBlock) => {
      const event = eventBlock.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
      const data = eventBlock.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
      return event && data ? { event, data } : null;
    })
    .filter(Boolean) as Array<{ event: string; data: string }>;
}

function readLocalConversations() {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as Conversation[];
    return parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([createConversation()]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<MessageCitation | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("local");
  const [localUserId, setLocalUserId] = useState<string>("");
  const auth = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const localConversations = readLocalConversations();
    const initial = localConversations || [createConversation()];
    const clientUserId = getClientUserId();
    const identity: ClientIdentity = { accessToken: auth.accessToken, userId: auth.user?.id || clientUserId };

    setLocalUserId(clientUserId);
    setConversations(initial);
    setActiveConversationId(initial[0]?.id || "");
    setPersistenceMode("syncing");

    fetchRemoteConversations(identity)
      .then(async (remote) => {
        if (!remote?.conversations.length) {
          const created = await createRemoteConversation(identity, initial[0]);
          setPersistenceMode(created ? "cloud" : "local");
          return;
        }

        const firstConversation = remote.conversations[0];
        const messages = await fetchRemoteMessages(identity, firstConversation.id);
        const hydrated = remote.conversations.map((conversation) =>
          conversation.id === firstConversation.id
            ? { ...conversation, messages: messages?.messages || [] }
            : conversation
        );

        setConversations(hydrated);
        setActiveConversationId(firstConversation.id);
        setPersistenceMode("cloud");
        const [docs, summary, queue] = await Promise.all([
          fetchDocuments(identity),
          fetchAnalyticsSummary(identity),
          fetchReviewQueue(identity)
        ]);
        setDocuments(docs?.documents || []);
        setAnalytics(summary);
        setReviewQueue(queue?.items || []);
      })
      .catch(() => setPersistenceMode("local"));
  }, [auth.accessToken, auth.user?.id]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeConversationId, isStreaming]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0],
    [activeConversationId, conversations]
  );

  const getIdentity = (): ClientIdentity | null => {
    const userId = auth.user?.id || localUserId;
    return userId ? { accessToken: auth.accessToken, userId } : null;
  };

  const updateConversation = (conversationId: string, updater: (conversation: Conversation) => Conversation) => {
    setConversations((current) =>
      current.map((conversation) => (conversation.id === conversationId ? updater(conversation) : conversation))
    );
  };

  const selectConversation = async (conversationId: string) => {
    setActiveConversationId(conversationId);

    const selected = conversations.find((conversation) => conversation.id === conversationId);
    const identity = getIdentity();
    if (!identity || !selected || selected.messages.length) return;

    const remote = await fetchRemoteMessages(identity, conversationId);
    if (!remote) return;

    updateConversation(conversationId, (conversation) => ({ ...conversation, messages: remote.messages }));
    setPersistenceMode("cloud");
  };

  const refreshQualityData = async () => {
    const identity = getIdentity();
    if (!identity) return;
    const [docs, summary, queue] = await Promise.all([
      fetchDocuments(identity),
      fetchAnalyticsSummary(identity),
      fetchReviewQueue(identity)
    ]);
    if (docs) setDocuments(docs.documents);
    if (summary) setAnalytics(summary);
    if (queue) setReviewQueue(queue.items);
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    const identity = getIdentity();
    if (!identity) {
      setUploadStatus("Configura una identidad antes de subir documentos.");
      return;
    }

    setUploadStatus(`Indexando ${file.name}...`);
    const result = await uploadDocument(identity, file);
    if (!result) {
      setUploadStatus("No se pudo indexar el documento. Revisa Supabase/OpenAI.");
      return;
    }

    setUploadStatus(`${result.document.filename}: ${result.chunks} fragmentos indexados.`);
    await refreshQualityData();
  };

  const startNewChat = () => {
    const next = createConversation();
    setConversations((current) => [next, ...current]);
    setActiveConversationId(next.id);
    setInput("");
    textareaRef.current?.focus();

    const identity = getIdentity();
    if (identity) {
      void createRemoteConversation(identity, next).then((ok) => setPersistenceMode(ok ? "cloud" : "local"));
    }
  };

  const persistMessage = async (conversationId: string, message: ChatMessage) => {
    const identity = getIdentity();
    if (!identity) return;
    const ok = await persistRemoteMessage(identity, conversationId, message);
    setPersistenceMode(ok ? "cloud" : "local");
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming || !activeConversation) return;

    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: createId(), role: "user", content: content.trim(), createdAt: now };
    const assistantMessage: ChatMessage = { id: createId(), role: "assistant", content: "", createdAt: now };
    const conversationId = activeConversation.id;
    const messagesForRequest = [...activeConversation.messages, userMessage];
    let assistantContent = "";
    let assistantCitations: ChatMessage["citations"] = [];

    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title: conversation.messages.length ? conversation.title : titleFromMessage(content),
      messages: [...conversation.messages, userMessage, assistantMessage],
      updatedAt: now
    }));

    setInput("");
    setIsStreaming(true);
    void persistMessage(conversationId, userMessage);
    const identity = getIdentity();
    if (identity && !activeConversation.messages.length) {
      void updateRemoteConversationTitle(identity, conversationId, titleFromMessage(content));
    }

    const rag = identity ? await searchRag(identity, content) : null;
    assistantCitations = rag?.citations || [];
    if (assistantCitations.length) {
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === assistantMessage.id ? { ...message, citations: assistantCitations } : message
        )
      }));
    }

    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messagesForRequest,
        ragContext: rag?.context,
        citations: assistantCitations,
        hasEvidence: rag?.hasEvidence || false
      })
    });

    if (!response.body) {
      setIsStreaming(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const completeEvents = buffer.split("\n\n");
      buffer = completeEvents.pop() || "";

      for (const block of completeEvents) {
        for (const parsed of parseSseChunk(`${block}\n\n`)) {
          const payload = JSON.parse(parsed.data) as { text?: string; message?: string };

          if (parsed.event === "token.delta" && payload.text) {
            assistantContent += payload.text;
            updateConversation(conversationId, (conversation) => ({
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: `${message.content}${payload.text}` }
                  : message
              ),
              updatedAt: new Date().toISOString()
            }));
          }

          if (parsed.event === "error") {
            assistantContent = `No pude completar la respuesta: ${payload.message || "error desconocido"}`;
            updateConversation(conversationId, (conversation) => ({
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === assistantMessage.id ? { ...message, content: assistantContent } : message
              )
            }));
          }
        }
      }
    }

    setIsStreaming(false);
    if (assistantContent) {
      await persistMessage(conversationId, { ...assistantMessage, content: assistantContent, citations: assistantCitations });
    }
  };


  const submitFeedback = async (message: ChatMessage, rating: "useful" | "incorrect" | "bad_source") => {
    const identity = getIdentity();
    if (!identity || !activeConversation) {
      setFeedbackStatus("Feedback disponible cuando hay identidad activa.");
      return;
    }

    const ok = await submitMessageFeedback(identity, {
      conversationId: activeConversation.id,
      messageId: message.id,
      rating,
      citations: message.citations || []
    });
    setFeedbackStatus(ok ? "Feedback guardado para mejorar evaluación." : "No se pudo guardar el feedback.");
    if (ok) void refreshQualityData();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  const persistenceLabel = {
    cloud: "Supabase sync",
    local: "Local fallback",
    syncing: "Sincronizando"
  }[persistenceMode];

  return (
    <main className="min-h-screen overflow-hidden bg-background text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.20),transparent_30%)]" />
      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="hidden border-r border-white/10 bg-slate-950/45 p-4 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="mb-5 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan to-accent font-black text-slate-950 shadow-glow">AI</div>
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-cyan">AbogadoRD</p>
              <h1 className="text-lg font-semibold">Chat MVP</h1>
            </div>
          </div>

          <Button variant="primary" className="mb-4 w-full" onClick={startNewChat}>+ Nuevo chat</Button>

          <label className="mb-4 block cursor-pointer rounded-3xl border border-dashed border-cyan/30 bg-cyan/10 p-4 text-sm text-cyan transition hover:bg-cyan/15">
            <span className="font-semibold">Subir documento RAG</span>
            <span className="mt-1 block text-xs text-cyan/75">PDF, TXT, MD o JSON · indexación semántica</span>
            <input type="file" accept=".pdf,.txt,.md,.json,.csv,text/*,application/pdf" className="hidden" onChange={(event) => void handleFileUpload(event.target.files?.[0] || null)} />
          </label>

          <div className="premium-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${conversation.id === activeConversation?.id ? "border-cyan/50 bg-cyan/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"}`}
                onClick={() => void selectConversation(conversation.id)}
              >
                <p className="truncate text-sm font-medium text-white">{conversation.title}</p>
                <p className="mt-1 text-xs text-slate-500">{conversation.messages.length} mensajes</p>
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
              <p className="font-medium text-slate-200">Documentos RAG</p>
              <p className="mt-2">{documents.length ? `${documents.length} documento(s) disponibles para citas.` : "Sube un documento para activar búsqueda semántica."}</p>
              {uploadStatus ? <p className="mt-2 text-xs text-cyan">{uploadStatus}</p> : null}
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
              <p className="font-medium text-slate-200">Quality analytics</p>
              <p className="mt-2">Evidence rate: {analytics ? `${Math.round(analytics.retrieval.evidenceRate * 100)}%` : "n/d"}</p>
              <p className="mt-1">Weak evidence: {analytics ? `${Math.round(analytics.retrieval.weakEvidenceRate * 100)}%` : "n/d"}</p>
              <p className="mt-1">Feedback negativo: {analytics ? `${Math.round(analytics.feedback.negativeRate * 100)}%` : "n/d"}</p>
              <p className="mt-1">Review queue: {reviewQueue.length}</p>
            </div>
            <AuthCard />
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
              <p className="font-medium text-slate-200">v0.2 Persistent Chat</p>
              <p className="mt-2">{persistenceLabel}. Supabase Auth usa el usuario real cuando hay sesión; el identificador local queda solo como fallback demo.</p>
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col pb-[env(safe-area-inset-bottom)]">
          <header className="flex items-center justify-between border-b border-white/10 bg-slate-950/35 px-4 py-3 backdrop-blur-xl md:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-cyan">Streaming real · {persistenceLabel}</p>
              <h2 className="text-lg font-semibold md:text-xl">{activeConversation?.title || "Nuevo chat"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Dark mode</span>
              <Button className="lg:hidden" onClick={startNewChat}>Nuevo</Button>
            </div>
          </header>

          <div className="premium-scrollbar flex-1 overflow-y-auto px-4 py-6 md:px-8">
            {!activeConversation?.messages.length ? (
              <div className="mx-auto flex min-h-[62vh] max-w-4xl flex-col items-center justify-center text-center">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-cyan">
                  v0.3 RAG Foundation · OpenAI · SSE · Supabase-ready
                </motion.div>
                <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
                  Plataforma jurídica IA con experiencia premium.
                </motion.h1>
                <p className="mt-5 max-w-2xl text-lg text-slate-400">Chat funcional con streaming token a token, Markdown avanzado, historial persistente y búsqueda semántica sobre documentos.</p>
                <div className="mt-8 grid w-full gap-3 md:grid-cols-3">
                  {starterPrompts.map((prompt) => (
                    <button key={prompt} className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-left text-sm text-slate-200 transition hover:border-cyan/40 hover:bg-cyan/10" onClick={() => void sendMessage(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-4xl space-y-6 pb-6">
                <AnimatePresence initial={false}>
                  {activeConversation.messages.map((message) => (
                    <motion.article
                      key={message.id}
                      initial={{ opacity: 0, y: 14, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8 }}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[88%] rounded-[1.6rem] border px-5 py-4 shadow-card md:max-w-[78%] ${message.role === "user" ? "border-cyan/30 bg-cyan/15" : "border-white/10 bg-white/[0.055]"}`}>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{message.role === "user" ? "Tú" : "AbogadoRD AI"}</div>
                        {message.content ? <><MarkdownMessage content={message.content} />{message.role === "assistant" ? <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3"><button type="button" onClick={() => void submitFeedback(message, "useful")} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-emerald-400/10 hover:text-emerald-200">👍 útil</button><button type="button" onClick={() => void submitFeedback(message, "incorrect")} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-rose-400/10 hover:text-rose-200">👎 incorrecto</button><button type="button" onClick={() => void submitFeedback(message, "bad_source")} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-amber-400/10 hover:text-amber-200">⚠ fuente</button></div> : null}{message.citations?.length ? <div className="mt-4 space-y-2 border-t border-white/10 pt-3">{message.citations.map((citation) => <button type="button" key={`${citation.documentId}-${citation.chunkIndex}`} onClick={() => setSelectedCitation(citation)} className="w-full rounded-2xl bg-cyan/10 px-3 py-2 text-left text-xs text-cyan transition hover:bg-cyan/20">Fuente: {citation.filename} · {citation.pageNumber ? `pág. ${citation.pageNumber}` : "pág. n/d"} · chunk {citation.chunkIndex}</button>)}</div> : null}</> : <div className="flex gap-1 py-2"><span className="h-2 w-2 animate-pulse rounded-full bg-cyan" /><span className="h-2 w-2 animate-pulse rounded-full bg-cyan delay-100" /><span className="h-2 w-2 animate-pulse rounded-full bg-cyan delay-200" /></div>}
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {feedbackStatus ? <div className="border-t border-white/10 bg-slate-950/40 px-4 py-2 text-center text-xs text-cyan">{feedbackStatus}</div> : null}
          <form onSubmit={handleSubmit} className="sticky bottom-0 border-t border-white/10 bg-slate-950/40 px-4 py-4 backdrop-blur-xl md:px-8">
            <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-2 shadow-card">
              <button type="button" className="mb-1 hidden rounded-2xl border border-white/10 px-3 py-2 text-sm text-slate-400 md:block" title="Subida future-ready">＋</button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                placeholder="Escribe tu consulta legal… Shift+Enter para nueva línea"
                className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-slate-500 md:text-base"
              />
              <Button type="submit" variant="primary" disabled={!input.trim() || isStreaming} className="mb-1 rounded-2xl px-5">
                {isStreaming ? "..." : "Enviar"}
              </Button>
            </div>
          </form>
        </section>
      </div>
      {selectedCitation ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm md:items-center">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-panel p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan">Cita documental</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{selectedCitation.filename}</h3>
                <p className="mt-1 text-sm text-slate-400">{selectedCitation.pageNumber ? `Página ${selectedCitation.pageNumber}` : "Página no detectada"} · chunk {selectedCitation.chunkIndex}</p>
              </div>
              <Button variant="subtle" onClick={() => setSelectedCitation(null)}>Cerrar</Button>
            </div>
            <blockquote className="mt-5 rounded-2xl border border-cyan/20 bg-cyan/10 p-4 text-sm leading-7 text-slate-200">
              {selectedCitation.quote}
            </blockquote>
            {typeof selectedCitation.score === "number" ? <p className="mt-3 text-xs text-slate-500">Score híbrido: {selectedCitation.score.toFixed(3)}</p> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
