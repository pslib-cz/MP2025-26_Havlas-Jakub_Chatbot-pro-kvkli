"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import BackofficeContent from "./components/BackofficeContent";

function createCookieClient() {
  const httpLink = createHttpLink({
    uri: "/api/graphql",
    credentials: "same-origin",
  });
  return new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache(),
  });
}

export default function BackofficePage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [client] = useState(() => createCookieClient());

  useEffect(() => {
    fetch("/api/auth/verify")
      .then((res) => {
        if (res.ok) {
          setAuthenticated(true);
        } else {
          router.replace("/");
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    router.replace("/");
  };

  if (!authenticated) return null;

  return (
    <ApolloProvider client={client}>
      <BackofficeContent onLogout={handleLogout} />
    </ApolloProvider>
  );
}
