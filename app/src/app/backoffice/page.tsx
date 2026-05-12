"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ApolloClient } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { createAuthClient } from "./utils/authClient";
import BackofficeContent from "./components/BackofficeContent";

export default function BackofficePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [authClient, setAuthClient] = useState<InstanceType<typeof ApolloClient> | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("backoffice_token");
    if (stored) {
      setToken(stored);
      setAuthClient(createAuthClient(stored));
    } else {
      router.replace("/");
    }
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("backoffice_token");
    setToken(null);
    setAuthClient(null);
    router.replace("/");
  };

  if (!token || !authClient) return null;

  return (
    <ApolloProvider client={authClient}>
      <BackofficeContent token={token} onLogout={handleLogout} />
    </ApolloProvider>
  );
}
