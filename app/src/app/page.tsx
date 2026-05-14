"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "./backoffice/components/LoginForm";

export default function Home() {
    const router = useRouter();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        fetch("/api/auth/verify")
            .then((res) => {
                if (res.ok) {
                    router.replace("/backoffice");
                } else {
                    setChecked(true);
                }
            })
            .catch(() => setChecked(true));
    }, [router]);

    if (!checked) return null;

    const handleLogin = () => {
        router.push("/backoffice");
    };

    return <LoginForm onLogin={handleLogin} />;
}
