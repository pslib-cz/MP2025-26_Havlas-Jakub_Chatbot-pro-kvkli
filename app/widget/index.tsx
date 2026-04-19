import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// ─── Type declarations ───────────────────────────────────────────────────────

declare global {
    interface Window {
        CHATBOT_BACKEND_URL?: string;
    }
}

// ─── GraphQL helpers ─────────────────────────────────────────────────────────

async function gqlMutation(
    url: string,
    query: string,
    variables: Record<string, unknown>,
) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) {
        const err = new Error(json.errors[0].message) as Error & {
            graphQLErrors?: Array<{ message: string }>;
        };
        err.graphQLErrors = json.errors;
        throw err;
    }
    return json.data;
}

const GQL_HEARTBEAT = `query Heartbeat { heartbeat }`;

const GQL_ADD_PROMPT = `
  mutation AddPrompt($promptText: String!, $conversationId: Int) {
    addPrompt(promptText: $promptText, conversationId: $conversationId) {
      conversationId
      prompt { promptId promptText answerText userFeedback conversationId }
    }
  }`;

const GQL_ADD_PROMPT_FEEDBACK = `
  mutation AddPromptFeedback($conversationId: Int!, $promptNth: Int!, $userFeedback: Boolean!) {
    addPromptFeedback(conversationId: $conversationId, promptNth: $promptNth, userFeedback: $userFeedback) {
      promptId userFeedback
    }
  }`;

const GQL_ADD_CONVO_FEEDBACK = `
  mutation AddConvoFeedback($conversationId: Int!, $userFeedback: Boolean, $userFeedbackMessage: String) {
    addConvoFeedback(conversationId: $conversationId, userFeedback: $userFeedback, userFeedbackMessage: $userFeedbackMessage) {
      conversationId userFeedback userFeedbackMessage
    }
  }`;

// ─── Constants ───────────────────────────────────────────────────────────────

const WAITING_MESSAGES = [
    "Chvilku strpení, prosím",
    "Hledám nejlepší odpověď",
    "Přemýšlím 🤔",
    "Skládám odpověď",
    "Ještě moment",
    "Zpracovávám dotaz",
    "Dávám to dohromady",
    "Kontroluji detaily",
    "Už to skoro je",
];

const LIMIT_COOKIE_NAME = "chatbot_limited";
const LIMIT_DURATION_MS = 60 * 60 * 1000;

function setChatbotLimitCookie() {
    const expires = new Date(Date.now() + LIMIT_DURATION_MS).toUTCString();
    document.cookie = `${LIMIT_COOKIE_NAME}=true; expires=${expires}; path=/; SameSite=Strict`;
}

function isChatbotLimited(): boolean {
    return document.cookie
        .split(";")
        .some((c) => c.trim().startsWith(`${LIMIT_COOKIE_NAME}=`));
}

// ─── Markdown renderer (bold + links + newlines) ──────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
    return text.split("\n").flatMap((line, lineIdx, lines) => {
        const nodes: React.ReactNode[] = [];
        const regex = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
        let last = 0;
        let match: RegExpExecArray | null;
        let key = lineIdx * 1000;

        while ((match = regex.exec(line)) !== null) {
            if (match.index > last)
                nodes.push(
                    <span key={key++}>{line.slice(last, match.index)}</span>,
                );
            const tok = match[0];
            if (tok.startsWith("**")) {
                nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
            } else {
                const m = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
                nodes.push(
                    <a
                        key={key++}
                        href={m[2]}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {m[1]}
                    </a>,
                );
            }
            last = match.index + tok.length;
        }
        if (last < line.length)
            nodes.push(<span key={key++}>{line.slice(last)}</span>);
        if (lineIdx < lines.length - 1)
            nodes.push(<br key={`br-${lineIdx}`} />);
        return nodes;
    });
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const BookIcon = () => (
    <svg width="27" height="26" viewBox="0 0 27 26" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
<path d="M10.1667 8.06862H10.18M16.8333 8.06862H16.8467M21.5 1.5C22.5609 1.5 23.5783 1.91523 24.3284 2.65434C25.0786 3.39346 25.5 4.39591 25.5 5.44117V15.951C25.5 16.9962 25.0786 17.9987 24.3284 18.7378C23.5783 19.4769 22.5609 19.8921 21.5 19.8921H14.8333L8.16667 23.8333V19.8921H5.5C4.43913 19.8921 3.42172 19.4769 2.67157 18.7378C1.92143 17.9987 1.5 16.9962 1.5 15.951V5.44117C1.5 4.39591 1.92143 3.39346 2.67157 2.65434C3.42172 1.91523 4.43913 1.5 5.5 1.5H21.5Z"/>
<path d="M10.1665 13.3235C10.601 13.7604 11.1196 14.1076 11.692 14.3445C12.2644 14.5815 12.879 14.7036 13.4998 14.7036C14.1207 14.7036 14.7353 14.5815 15.3077 14.3445C15.88 14.1076 16.3987 13.7604 16.8332 13.3235"/>
</svg>
);

const ChevronRightIcon = () => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

const SendIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const ThumbUpIcon = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
);

const ThumbDownIcon = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
        <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
);

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingDots() {
    return (
        <div className="cw-dots">
            <div className="cw-dot" />
            <div className="cw-dot" />
            <div className="cw-dot" />
        </div>
    );
}

interface MessageBubbleProps {
    message: string;
    answer?: string;
    onLike: () => void;
    onDislike: () => void;
    likedState?: "like" | "dislike" | null;
}

function MessageBubble({
    message,
    answer,
    onLike,
    onDislike,
    likedState,
}: MessageBubbleProps) {
    return (
        <>
            <div className="cw-user-row">
                <div className="cw-user-bubble">{message}</div>
            </div>
            {answer && (
                <div className="cw-bot-row">
                    <div className="cw-bot-bubble">
                        <div className="cw-bot-text">
                            {renderMarkdown(answer)}
                        </div>
                        <div className="cw-fb-row">
                            <button
                                className={`cw-fb-btn${likedState === "like" ? " cw-liked" : ""}`}
                                onClick={onLike}
                                aria-label="Líbí se mi"
                            >
                                <ThumbUpIcon />
                            </button>
                            <button
                                className={`cw-fb-btn${likedState === "dislike" ? " cw-liked" : ""}`}
                                onClick={onDislike}
                                aria-label="Nelíbí se mi"
                            >
                                <ThumbDownIcon />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
#cw-root{position:fixed;bottom:24px;right:24px;z-index:99999;font-family:'DM Sans',Poppins,Arial,sans-serif;font-size:14px;line-height:1.5;}
#cw-root *{box-sizing:border-box;}
@keyframes cw-bounce{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.5}}
@keyframes cw-slidein{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes cw-slideout{from{transform:translateX(0);opacity:1}to{transform:translateX(120%);opacity:0}}
@keyframes cw-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cw-btn{background:#FBBF24;color:#000;border:none;border-radius:9999px;padding:12px 18px;display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;font-size:14px;box-shadow:0 10px 25px rgba(0,0,0,.2);transition:transform .2s,box-shadow .2s;white-space:nowrap;font-family:inherit;}
.cw-btn:hover{transform:translateY(-4px) scale(1.05);box-shadow:0 14px 30px rgba(0,0,0,.25);}
.cw-window{width:480px;height:600px;background:#fff;border-radius:5px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;position:absolute;bottom:0;right:0;}
.cw-opening{animation:cw-slidein .3s ease;}
.cw-closing{animation:cw-slideout .3s ease forwards;}
.cw-header{background:#3d4b6e;color:#fff;padding:16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.cw-header-left{display:flex;align-items:center;gap:12px;}
.cw-header-icon{background:#fff;border-radius:9999px;padding:8px;display:flex;}
.cw-header-title{font-weight:600;font-size:18px;margin:0;}
.cw-close-btn{background:none;border:none;color:#fff;cursor:pointer;padding:4px;border-radius:4px;display:flex;line-height:1;}
.cw-close-btn:hover{background:rgba(255,255,255,.15);}
.cw-messages{flex:1;padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;background:#f9fafb;}
.cw-user-row{display:flex;justify-content:flex-end;}
.cw-user-bubble{background:#3d4b6e;color:#fff;padding:8px 16px;border-radius:22px 22px 0 22px;max-width:80%;line-height:1.5;}
.cw-bot-row{display:flex;gap:8px;align-items:flex-start;margin-top:8px;}
.cw-bot-bubble{background:#fff;color:#1f2937;padding:12px;border-radius:8px;max-width:75%;line-height:1.6;box-shadow:0 1px 3px rgba(0,0,0,.1);}
.cw-bot-text a{color:#3b82f6;text-decoration:underline;}
.cw-bot-text strong{font-weight:700;}
.cw-fb-row{display:flex;gap:8px;margin-top:8px;}
.cw-fb-btn{background:none;border:none;cursor:pointer;color:#6b7280;padding:2px;display:flex;border-radius:4px;transition:color .15s;line-height:1;}
.cw-fb-btn:hover{color:#3d4b6e;}
.cw-fb-btn.cw-liked{color:#22c55e;}
.cw-loading{display:flex;gap:8px;align-items:center;}
.cw-dots{background:#3d4b6e;color:#fff;padding:12px;border-radius:9999px;display:flex;gap:4px;align-items:center;}
.cw-dot{width:8px;height:8px;background:#fff;border-radius:9999px;}
.cw-dot:nth-child(1){animation:cw-bounce .8s 0s infinite;}
.cw-dot:nth-child(2){animation:cw-bounce .8s .2s infinite;}
.cw-dot:nth-child(3){animation:cw-bounce .8s .4s infinite;}
.cw-loading-text{color:#6b7280;font-style:italic;animation:cw-fadein .3s ease;}
.cw-input-area{display:flex;align-items:center;padding:12px;background:#3d4b6e;gap:8px;flex-shrink:0;}
.cw-input{flex:1;padding:12px 16px;border-radius:9999px;background:#4a5a7f;color:#fff;border:none;outline:none;font-size:14px;font-family:inherit;}
.cw-input::placeholder{color:#9ca3af;}
.cw-send-btn{background:#4a5a7f;color:#fff;border:none;border-radius:9999px;padding:12px;cursor:pointer;display:flex;transition:background .2s;line-height:1;}
.cw-send-btn:hover{background:#5a6a8f;}
.cw-limit-banner{padding:12px;border-top:1px solid #e5e7eb;background:#f3f4f6;text-align:center;color:#6b7280;flex-shrink:0;}
.cw-feedback-card{background:#fefce8;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:12px;animation:cw-fadein .3s ease;font-size:13px;}
.cw-feedback-card-title{font-weight:600;margin:0;}
.cw-feedback-card p{margin:0;}
.cw-cf-row{display:flex;gap:12px;justify-content:center;}
.cw-cf-yes,.cw-cf-no{border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;font-family:inherit;transition:background .2s;}
.cw-cf-yes{background:#22c55e;color:#fff;}
.cw-cf-yes:hover{background:#16a34a;}
.cw-cf-no{background:#ef4444;color:#fff;}
.cw-cf-no:hover{background:#dc2626;}
.cw-cf-yes:disabled,.cw-cf-no:disabled{opacity:.5;cursor:not-allowed;}
.cw-feedback-textarea{width:100%;border:1px solid #fde68a;border-radius:8px;padding:8px;font-size:13px;background:#fff;color:#1f2937;resize:none;font-family:inherit;}
.cw-success-card{background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:8px;padding:12px;text-align:center;animation:cw-fadein .3s ease;font-size:13px;}
.cw-success-card a{text-decoration:underline;font-weight:600;color:inherit;}
.cw-toast{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:8px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);white-space:nowrap;animation:cw-fadein .3s ease;pointer-events:none;font-size:13px;}
@media(max-width:640px){
  #cw-root{bottom:0;right:0;left:0;}
  .cw-btn-wrap{display:flex;justify-content:center;}
  .cw-window{width:100%;height:calc(100dvh - 4em);height:calc(100vh - 4em);border-radius:0;position:fixed;bottom:0;left:0;right:0;}
}
`;

// ─── Main widget component ────────────────────────────────────────────────────

function ChatWidget({ backendUrl }: { backendUrl: string }) {
    let correctedUrl =
        backendUrl || "https://chatbot.144-91-77-107.sslip.io/api/graphql";

    if (
        correctedUrl.includes("144-91-77-107.sslip.io") &&
        !correctedUrl.includes("chatbot.")
    ) {
        correctedUrl = correctedUrl.replace(
            "144-91-77-107.sslip.io",
            "chatbot.144-91-77-107.sslip.io",
        );
    }

    const normalizedBackendUrl = correctedUrl.replace(/\/$/, "");
    const gqlUrl = normalizedBackendUrl.endsWith("/api/graphql")
        ? normalizedBackendUrl
        : `${normalizedBackendUrl}/api/graphql`;

    const [serverAvailable, setServerAvailable] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [windowMounted, setWindowMounted] = useState(false);

    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<string[]>([]);
    const [answers, setAnswers] = useState<string[]>([]);
    const [feedbackStates, setFeedbackStates] = useState<
        Record<number, "like" | "dislike">
    >({});
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [waitingMsgIdx, setWaitingMsgIdx] = useState(0);
    const [isLimited, setIsLimited] = useState(false);
    const [feedbackToast, setFeedbackToast] = useState(false);
    const [convoFeedbackSubmitted, setConvoFeedbackSubmitted] = useState(false);
    const [convoFeedbackLoading, setConvoFeedbackLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch(gqlUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: GQL_HEARTBEAT,
                operationName: "Heartbeat",
            }),
        })
            .then((r) => r.json())
            .then((d) => {
                if (d?.data?.heartbeat) setServerAvailable(true);
            })
            .catch(() => {});
    }, [gqlUrl]);

    useEffect(() => {
        if (isChatbotLimited()) setIsLimited(true);
    }, []);

    useEffect(() => {
        if (!isLoading) return;
        const interval = setInterval(
            () => setWaitingMsgIdx((p) => (p + 1) % WAITING_MESSAGES.length),
            2000,
        );
        return () => clearInterval(interval);
    }, [isLoading]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, answers, isLoading]);

    if (!serverAvailable) return null;

    const handleOpen = () => {
        setWindowMounted(true);
        setIsOpen(true);
        setIsClosing(false);
    };

    const handleClose = () => {
        setIsClosing(true);
        setIsOpen(false);
        setTimeout(() => {
            setWindowMounted(false);
            setIsClosing(false);
        }, 300);
    };

    const handleSend = async () => {
        if (!input.trim() || isLimited) return;
        const msg = input.trim();
        setInput("");
        setMessages((p) => [...p, msg]);
        setIsLoading(true);
        setWaitingMsgIdx(0);

        try {
            const data = await gqlMutation(gqlUrl, GQL_ADD_PROMPT, {
                promptText: msg,
                conversationId,
            });
            if (data?.addPrompt?.conversationId) {
                setConversationId(data.addPrompt.conversationId);
            }
            setAnswers((p) => [
                ...p,
                data?.addPrompt?.prompt?.answerText ?? "",
            ]);
        } catch (err: unknown) {
            const e = err as {
                message?: string;
                graphQLErrors?: Array<{ message: string }>;
            };
            const isLimitErr =
                e?.message?.includes("CONVERSATION_LIMIT_REACHED") ||
                e?.graphQLErrors?.some((ge) =>
                    ge.message.includes("CONVERSATION_LIMIT_REACHED"),
                );

            if (isLimitErr) {
                setChatbotLimitCookie();
                setIsLimited(true);
                setMessages((p) => p.slice(0, -1));
            } else {
                setAnswers((p) => [
                    ...p,
                    "Omlouvám se, došlo k chybě. Zkuste to prosím znovu.",
                ]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleFeedback = async (idx: number, isPositive: boolean) => {
        if (!conversationId) return;
        try {
            await gqlMutation(gqlUrl, GQL_ADD_PROMPT_FEEDBACK, {
                conversationId,
                promptNth: idx,
                userFeedback: isPositive,
            });
            setFeedbackStates((p) => ({
                ...p,
                [idx]: isPositive ? "like" : "dislike",
            }));
            setFeedbackToast(true);
            setTimeout(() => setFeedbackToast(false), 2000);
        } catch {
            // silently ignore feedback errors
        }
    };

    const handleConvoFeedback = async (isPositive: boolean) => {
        if (!conversationId || convoFeedbackSubmitted) return;
        setConvoFeedbackLoading(true);
        try {
            await gqlMutation(gqlUrl, GQL_ADD_CONVO_FEEDBACK, {
                conversationId,
                userFeedback: isPositive,
            });
            setConvoFeedbackSubmitted(true);
        } catch {
            // silently ignore
        } finally {
            setConvoFeedbackLoading(false);
        }
    };

    return (
        <>
            <div className="cw-btn-wrap">
                <button
                    className="cw-btn"
                    onClick={handleOpen}
                    style={{
                        opacity: windowMounted ? 0 : 1,
                        pointerEvents: windowMounted ? "none" : "auto",
                        transition: "opacity 0.3s",
                    }}
                >
                    <span>Potřebuješ radu? Napiš!</span>
                    <BookIcon />
                </button>
            </div>

            {windowMounted && (
                <div className={`cw-window ${isClosing ? "cw-closing" : "cw-opening"}`}>

                    <div className="cw-header">
                        <div className="cw-header-left">
                            <div className="cw-header-icon">
                                <BookIcon />
                            </div>
                            <span className="cw-header-title">
                                Aleš Knihovník
                            </span>
                        </div>
                        <button
                            className="cw-close-btn"
                            onClick={handleClose}
                            aria-label="Zavřít"
                        >
                            <ChevronRightIcon />
                        </button>
                    </div>

                    <div className="cw-messages">
                        {messages.map((msg, i) => (
                            <MessageBubble
                                key={i}
                                message={msg}
                                answer={answers[i]}
                                onLike={() => handleFeedback(i, true)}
                                onDislike={() => handleFeedback(i, false)}
                                likedState={feedbackStates[i] ?? null}
                            />
                        ))}

                        {isLoading && (
                            <div className="cw-loading">
                                <LoadingDots />
                                <span
                                    key={waitingMsgIdx}
                                    className="cw-loading-text"
                                >
                                    {WAITING_MESSAGES[waitingMsgIdx]}
                                </span>
                            </div>
                        )}

                        {isLimited && !convoFeedbackSubmitted && (
                            <div className="cw-feedback-card">
                                <p className="cw-feedback-card-title">
                                    ⚠️ Dosáhli jste maximálního počtu zpráv v
                                    této konverzaci.
                                </p>
                                <p>Jak hodnotíte tuto konverzaci?</p>
                                <div className="cw-cf-row">
                                    <button
                                        className="cw-cf-yes"
                                        disabled={convoFeedbackLoading}
                                        onClick={() =>
                                            handleConvoFeedback(true)
                                        }
                                    >
                                        👍 Pomohlo mi to
                                    </button>
                                    <button
                                        className="cw-cf-no"
                                        disabled={convoFeedbackLoading}
                                        onClick={() =>
                                            handleConvoFeedback(false)
                                        }
                                    >
                                        👎 Nepomohlo
                                    </button>
                                </div>
                            </div>
                        )}

                        {isLimited && convoFeedbackSubmitted && (
                            <div className="cw-success-card">
                                ✅ Děkujeme za zpětnou vazbu! Zkuste to znovu za
                                hodinu, nebo nás{" "}
                                <a
                                    href="https://www.kvkli.cz/kontakt/kontakty-dle-oddeleni"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    kontaktujte přímo
                                </a>
                                .
                            </div>
                        )}

                        <div ref={messagesEndRef} />

                        {feedbackToast && (
                            <div className="cw-toast">Zpětná vazba uložena</div>
                        )}
                    </div>

                    {isLimited ? (
                        <div className="cw-limit-banner">
                            Chat je dočasně nedostupný. Zkuste to později.
                        </div>
                    ) : (
                        <div className="cw-input-area">
                            <input
                                type="text"
                                className="cw-input"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="Sem můžete psát..."
                            />
                            <button
                                className="cw-send-btn"
                                onClick={handleSend}
                                aria-label="Odeslat"
                            >
                                <SendIcon />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

function injectStyles() {
    if (document.getElementById("cw-styles")) return;
    const el = document.createElement("style");
    el.id = "cw-styles";
    el.textContent = CSS;
    document.head.appendChild(el);
}

function getBackendUrl(): string {
    const script =
        (document.currentScript as HTMLScriptElement | null) ||
        document.querySelector<HTMLScriptElement>("script[data-backend]");
    const attr = script?.dataset?.backend;
    if (typeof attr === "string" && attr.trim() !== "" && attr.trim() !== "/") {
        if (attr.startsWith("/")) {
            return `https://chatbot.144-91-77-107.sslip.io${attr}`;
        }
        return attr.replace(/\/$/, "");
    }

    if (
        typeof window.CHATBOT_BACKEND_URL === "string" &&
        window.CHATBOT_BACKEND_URL.trim() !== ""
    ) {
        const url = window.CHATBOT_BACKEND_URL.trim();
        if (
            url.includes("144-91-77-107.sslip.io") &&
            !url.includes("chatbot.")
        ) {
            return url
                .replace(
                    "144-91-77-107.sslip.io",
                    "chatbot.144-91-77-107.sslip.io",
                )
                .replace(/\/$/, "");
        }
        return url.replace(/\/$/, "");
    }

    return "https://chatbot.144-91-77-107.sslip.io/api/graphql";
}

function mount() {
    injectStyles();

    const backendUrl = getBackendUrl();
    const container = document.createElement("div");
    container.id = "cw-root";
    document.body.appendChild(container);

    createRoot(container).render(
        <React.StrictMode>
            <ChatWidget backendUrl={backendUrl} />
        </React.StrictMode>,
    );
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
} else {
    mount();
}
