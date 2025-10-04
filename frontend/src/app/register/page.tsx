"use client";

import { FormEvent, useState } from "react";
import { registerApi, type RegisterRequest } from "@/lib/api";

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterRequest>({ username: "", password: "", display_name: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      await registerApi(form);
      setOk("Registration successful. You can now sign in.");
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.href = "/login";
      }, 800);
    } catch (err: any) {
      setError(err?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black/30 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--canvas-border)] bg-black/60 p-6">
        <h1 className="text-lg font-semibold text-text-primary">Create account</h1>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {ok ? <p className="text-sm text-green-400">{ok}</p> : null}
        <div className="space-y-2">
          <label className="block text-sm text-text-muted">Username</label>
          <input className="w-full rounded-md border border-[var(--canvas-border)] bg-transparent px-3 py-2 text-sm text-text-primary outline-none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jane" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-text-muted">Password</label>
          <input className="w-full rounded-md border border-[var(--canvas-border)] bg-transparent px-3 py-2 text-sm text-text-primary outline-none" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="********" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-text-muted">Display name</label>
          <input className="w-full rounded-md border border-[var(--canvas-border)] bg-transparent px-3 py-2 text-sm text-text-primary outline-none" value={form.display_name ?? ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-text-muted">Email</label>
          <input className="w-full rounded-md border border-[var(--canvas-border)] bg-transparent px-3 py-2 text-sm text-text-primary outline-none" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <button type="submit" className="w-full rounded-md bg-[var(--canvas-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </button>
        <p className="text-center text-xs text-text-muted">Already have an account? <a className="underline" href="/login">Sign in</a></p>
      </form>
    </div>
  );
}

