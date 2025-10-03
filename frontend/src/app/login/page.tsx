"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ username, password });
      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black/30 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--canvas-border)] bg-black/60 p-6">
        <h1 className="text-lg font-semibold text-text-primary">Sign in</h1>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="space-y-2">
          <label className="block text-sm text-text-muted">Username</label>
          <input
            className="w-full rounded-md border border-[var(--canvas-border)] bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-text-muted">Password</label>
          <input
            className="w-full rounded-md border border-[var(--canvas-border)] bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-[var(--canvas-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-center text-xs text-text-muted">Default admin: admin / admin123</p>
      </form>
    </div>
  );
}

