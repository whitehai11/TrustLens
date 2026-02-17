"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(`http://localhost:4000${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Authentication failed");
      return;
    }

    window.localStorage.setItem("trustlens_token", data.token);
    window.localStorage.setItem("trustlens_user", JSON.stringify(data.user));
    window.dispatchEvent(new Event("trustlens-auth-changed"));
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">{mode === "login" ? "Login" : "Create account"}</h1>
      <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <input className="w-full rounded-xl border border-slate-200 px-4 py-3" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input className="w-full rounded-xl border border-slate-200 px-4 py-3" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required minLength={8} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="w-full rounded-xl bg-slate-900 px-4 py-3 text-white">{mode === "login" ? "Login" : "Register"}</button>
      </form>
      <button className="mt-4 text-sm text-slate-600 underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
      </button>
    </main>
  );
}
