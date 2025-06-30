"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiResponse, getErrorMessage } from "@/lib/types/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        router.push("/dashboard");
      } else {
        setError(getErrorMessage(data.error, "ログインに失敗しました"));
      }
    } catch {
      setError("ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">ログイン</h1>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full p-2 border rounded"
        />

        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full p-2 border rounded"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full p-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
