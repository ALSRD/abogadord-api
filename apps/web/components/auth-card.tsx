"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function AuthCard() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    const result = await auth.signInWithEmail(email.trim());
    setIsSubmitting(false);
    setStatus(result.error ? `Error: ${result.error}` : "Revisa tu correo para iniciar sesión con magic link.");
  };

  if (!auth.isConfigured) {
    return (
      <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
        <p className="font-semibold">Modo demo sin Auth</p>
        <p className="mt-2 text-amber-100/80">Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY para activar Supabase Auth.</p>
      </div>
    );
  }

  if (auth.user) {
    return (
      <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
        <p className="font-semibold">Sesión activa</p>
        <p className="mt-1 truncate text-emerald-100/80">{auth.user.email}</p>
        <Button className="mt-3 w-full" variant="subtle" onClick={() => void auth.signOut()}>Cerrar sesión</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
      <p className="font-semibold text-white">Supabase Auth</p>
      <p className="mt-2 text-slate-400">Inicia sesión con magic link para asociar el historial a tu usuario real.</p>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="tu@email.com"
        className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-cyan/60"
      />
      <Button className="mt-3 w-full" variant="primary" disabled={isSubmitting || !email.trim()}>
        {isSubmitting ? "Enviando..." : "Enviar magic link"}
      </Button>
      {status ? <p className="mt-3 text-xs text-slate-400">{status}</p> : null}
    </form>
  );
}
