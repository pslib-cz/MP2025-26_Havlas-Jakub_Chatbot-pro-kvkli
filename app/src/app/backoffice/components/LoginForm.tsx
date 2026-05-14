"use client";

import { useState } from "react";

type LoginFormProps = {
  onLogin: () => void;
};

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setAuthError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        onLogin();
      } else {
        setAuthError("Invalid username or password.");
      }
    } catch {
      setAuthError("Login failed. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <form onSubmit={handleLogin} className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Backoffice Login</h1>
        {authError && <p className="text-red-500 mb-3 text-sm">{authError}</p>}
        <label className="block mb-2 text-sm text-gray-700 dark:text-gray-300">
          Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
        </label>
        <label className="block mb-4 text-sm text-gray-700 dark:text-gray-300">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
        </label>
        <button type="submit" disabled={loginLoading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {loginLoading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
