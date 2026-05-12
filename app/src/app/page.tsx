"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "./backoffice/components/LoginForm";

export default function Home() {
    const router = useRouter();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (sessionStorage.getItem("backoffice_token")) {
            router.replace("/backoffice");
        } else {
            setChecked(true);
        }
    }, [router]);

    if (!checked) return null;

    const handleLogin = (token: string) => {
        sessionStorage.setItem("backoffice_token", token);
        router.push("/backoffice");
    };

    return <LoginForm onLogin={handleLogin} />;
}
