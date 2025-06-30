"use client";

import { useState } from "react";
import { ApiResponse, getErrorMessage } from "@/lib/types/api";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        setMessage(data.message || "リセットメールを送信しました");
      } else {
        setError(getErrorMessage(data.error, "リセット要求に失敗しました"));
      }
    } catch {
      setError("リセット要求に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">パスワードリセット</h1>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        {message && <div className="text-green-600 text-sm">{message}</div>}

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full p-2 border rounded"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full p-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "送信中..." : "リセットメール送信"}
        </button>
      </form>
    </div>
  );
}
