"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useMutation, useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import Image from "next/image";
import { ADD_PROMPT, ADD_PROMPT_FEEDBACK, ADD_CONVO_FEEDBACK } from "./chatbot/graphql";
import { WAITING_MESSAGES } from "./chatbot/utils";
import MessageBubble from "./chatbot/MessageBubble";
import LoadingIndicator from "./chatbot/LoadingIndicator";
import ChatInput from "./chatbot/ChatInput";
import type { AddPromptData, FeedbackData } from "./chatbot/types";
const HEARTBEAT = gql`
  query Heartbeat {
    heartbeat
  }
`;



export default function Chatbot() {
    const { data: heartbeatData, loading: heartbeatLoading } = useQuery<{ heartbeat: boolean }>(HEARTBEAT, {
        fetchPolicy: "network-only",
    });

    const [addPromptMutation] = useMutation<
        AddPromptData,
        { promptText: string; conversationId?: number | null }
    >(ADD_PROMPT);
    const [addPromptFeedbackMutation] =
        useMutation<FeedbackData>(ADD_PROMPT_FEEDBACK);
    const [addConvoFeedbackMutation] = useMutation(ADD_CONVO_FEEDBACK);

    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<string[]>([]);
    const [answers, setAnswers] = useState<string[]>([]);
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [waitingMessageIndex, setWaitingMessageIndex] = useState(0);
    const [isLimited, setIsLimited] = useState(false);
    const [feedbackToast, setFeedbackToast] = useState<{
        show: boolean;
        messageIndex: number | null;
    }>({ show: false, messageIndex: null });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [convoFeedbackSubmitted, setConvoFeedbackSubmitted] = useState(false);
    const [convoFeedbackLoading, setConvoFeedbackLoading] = useState(false);



    useEffect(() => {
        if (isLoading) {
            const interval = setInterval(() => {
                setWaitingMessageIndex(
                    (prev) => (prev + 1) % WAITING_MESSAGES.length,
                );
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [isLoading]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, answers, isLoading]);

    // Don't render anything while checking heartbeat or if server is down
    if (heartbeatLoading) return null;
    if (!heartbeatData?.heartbeat) return null;

    const handleSendMessage = async () => {
        if (!input.trim() || isLimited) return;

        const messageToSend = input;
        setInput("");
        setMessages((prev) => [...prev, messageToSend]);
        setIsLoading(true);
        setWaitingMessageIndex(0);

        try {
            const { data: addPromptResponse } = await addPromptMutation({
                variables: {
                    promptText: messageToSend,
                    conversationId,
                },
            });

            if (addPromptResponse?.addPrompt.conversationId) {
                setConversationId(addPromptResponse.addPrompt.conversationId);
            }

            // Check server-enforced rate limit
            if (addPromptResponse?.addPrompt.rateLimited) {
                setIsLimited(true);
            }

            setAnswers((prev) => [
                ...prev,
                addPromptResponse?.addPrompt.prompt.answerText || "",
            ]);
        } catch (err: unknown) {
            const error =
                err as { message?: string; graphQLErrors?: Array<{ message: string }> };
            const isLimitError =
                error?.message?.includes("CONVERSATION_LIMIT_REACHED") ||
                error?.graphQLErrors?.some((e) => e.message.includes("CONVERSATION_LIMIT_REACHED"));

            if (isLimitError) {
                setIsLimited(true);
                // Remove the last user message that failed
                setMessages((prev) => prev.slice(0, -1));
            } else {
                console.error("Error adding prompt:", err);
                setAnswers((prev) => [
                    ...prev,
                    "Omlouvám se, došlo k chybě. Zkuste to prosím znovu.",
                ]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleFeedback = async (
        messageIndex: number,
        isPositive: boolean,
    ) => {
        try {
            await addPromptFeedbackMutation({
                variables: {
                    conversationId: conversationId!,
                    promptNth: messageIndex,
                    userFeedback: isPositive,
                },
            });

            setFeedbackToast({ show: true, messageIndex });
            setTimeout(() => {
                setFeedbackToast({ show: false, messageIndex: null });
            }, 2000);
        } catch (err) {
            console.error("Error submitting feedback:", err);
        }
    };

    const handleConvoFeedback = async (isPositive: boolean) => {
        if (!conversationId || convoFeedbackSubmitted) return;
        setConvoFeedbackLoading(true);
        try {
            await addConvoFeedbackMutation({
                variables: {
                    conversationId,
                    userFeedback: isPositive,
                },
            });
            setConvoFeedbackSubmitted(true);
        } catch (err) {
            console.error("Error submitting conversation feedback:", err);
        } finally {
            setConvoFeedbackLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 max-sm:bottom-0 max-sm:right-0 max-sm:left-0">
            <motion.button
                animate={{ opacity: isOpen ? 0 : 1, scale: isOpen ? 1 : 1 }}
                transition={{ duration: 0.3 }}
                onClick={() => setIsOpen(true)}
                className="bg-yellow-400 shadow-xl text-black font-medium px-4 py-3 rounded-full flex items-center gap-2 hover:bg-yellow-400 dark:bg-yellow-500 dark:text-black transition delay-150 duration-300 ease-in-out hover:-translate-y-1 hover:scale-110 max-sm:mx-auto"
                style={{ pointerEvents: isOpen ? "none" : "auto" }}
            >
                <span>Potřebuješ radu? Napiš!</span>
                <Image
                    src="/book-icon.svg"
                    alt="Book"
                    width={24}
                    height={24}
                    style={{ filter: "brightness(0)" }}
                />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="chatbot-window"
                        initial={{ x: 400, scale: 1 }}
                        animate={{ x: 0, scale: 1 }}
                        exit={{ x: 400, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="w-120 bg-white rounded-[5px] shadow-0.5xl overflow-hidden flex flex-col absolute bottom-0 right-0 max-sm:w-full max-sm:rounded-none max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0"
                        style={{ height: "600px" }}
                        ref={(el) => {
                            if (el && window.innerWidth < 640) {
                                el.style.height = "calc(100vh - 4em)";
                            }
                        }}
                    >
                        <div className="bg-[#3d4b6e] text-white p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-white p-2 rounded-full">
                                    <Image src="/book-icon.svg" alt="Book" width={24} height={24} />
                                </div>
                                <span className="font-semibold text-lg">Aleš Knihovník</span>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-1 rounded">
                                <ChevronRight size={24} />
                            </button>
                        </div>

                        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50">
                            {messages.map((msg, i) => (
                                <MessageBubble
                                    key={i}
                                    message={msg}
                                    answer={answers[i]}
                                    onLike={() => handleFeedback(i, true)}
                                    onDislike={() => handleFeedback(i, false)}
                                    showFeedbackAnimation={feedbackToast.show && feedbackToast.messageIndex === i}
                                />
                            ))}

                            {isLoading && <LoadingIndicator messageIndex={waitingMessageIndex} />}

                            {isLimited && !convoFeedbackSubmitted && (
                                <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg p-4 text-sm space-y-3">
                                    <p className="font-medium">⚠️ Dosáhli jste maximálního počtu zpráv v této konverzaci.</p>
                                    <p>Jak hodnotíte tuto konverzaci?</p>
                                    <div className="flex gap-3 justify-center">
                                        <button
                                            onClick={() => handleConvoFeedback(true)}
                                            disabled={convoFeedbackLoading}
                                            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                                        >
                                            👍 Pomohlo mi to
                                        </button>
                                        <button
                                            onClick={() => handleConvoFeedback(false)}
                                            disabled={convoFeedbackLoading}
                                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                                        >
                                            👎 Nepomohlo
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isLimited && convoFeedbackSubmitted && (
                                <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg p-3 text-sm text-center">
                                    ✅ Děkujeme za zpětnou vazbu! Zkuste to znovu za hodinu, nebo nás
                                    <a
                                        href="https://www.kvkli.cz/kontakt/kontakty-dle-oddeleni"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline font-medium hover:text-green-900"
                                    >
                                        kontaktujte přímo
                                    </a>.
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        <AnimatePresence>
                            {feedbackToast.show && (
                                <motion.div
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 50 }}
                                    className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg"
                                >
                                    Zpětná vazba uložena
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {isLimited ? (
                            <div className="p-3 border-t bg-gray-100 text-center text-sm text-gray-500">
                                Chat je dočasně nedostupný. Zkuste to později.
                            </div>
                        ) : (
                            <ChatInput value={input} onChange={setInput} onSend={handleSendMessage} />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
