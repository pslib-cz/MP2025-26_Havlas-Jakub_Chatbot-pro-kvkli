"use client";

import { useState, useEffect } from "react";
import { ApolloClient } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { createAuthClient } from "./utils/authClient";
import LoginForm from "./components/LoginForm";
import BackofficeContent from "./components/BackofficeContent";

export default function PromptsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [authClient, setAuthClient] = useState<InstanceType<typeof ApolloClient> | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("backoffice_token");
    if (stored) {
      setToken(stored);
      setAuthClient(createAuthClient(stored));
    }
  }, []);

  const handleLogin = (t: string) => {
    sessionStorage.setItem("backoffice_token", t);
    setToken(t);
    setAuthClient(createAuthClient(t));
  };

  const handleLogout = () => {
    sessionStorage.removeItem("backoffice_token");
    setToken(null);
    setAuthClient(null);
  };

  if (!token || !authClient) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <ApolloProvider client={authClient}>
      <BackofficeContent token={token} onLogout={handleLogout} />
    </ApolloProvider>
  );
}
