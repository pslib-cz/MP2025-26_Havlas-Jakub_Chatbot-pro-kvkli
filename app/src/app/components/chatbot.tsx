"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useMutation } from "@apollo/client/react";
import Image from "next/image";
import { ADD_PROMPT, ADD_PROMPT_FEEDBACK } from "./chatbot/graphql";
import { AddPromptData, FeedbackData } from "@/types/chatbot";
import { WAITING_MESSAGES } from "./chatbot/utils";
import MessageBubble from "./chatbot/MessageBubble";
import LoadingIndicator from "./chatbot/LoadingIndicator";
import ChatInput from "./chatbot/ChatInput";

export default function Chatbot() {
  const [addPromptMutation] = useMutation<AddPromptData, { promptText: string; conversationId?: number | null }>(ADD_PROMPT);
  const [addPromptFeedbackMutation] = useMutation<FeedbackData>(ADD_PROMPT_FEEDBACK);
  
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [waitingMessageIndex, setWaitingMessageIndex] = useState(0);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setWaitingMessageIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
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

      setAnswers((prev) => [
        ...prev,
        addPromptResponse?.addPrompt.prompt.answerText || "",
      ]);
    } catch (err) {
      console.error("Error adding prompt:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageIndex: number, isPositive: boolean) => {
    try {
      await addPromptFeedbackMutation({
        variables: {
          conversationId: conversationId!,
          promptNth: messageIndex,
          userFeedback: isPositive,
        },
      });
    } catch (err) {
      console.error("Error submitting feedback:", err);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-sm:bottom-0 max-sm:right-0 max-sm:left-0">
      <motion.button
        animate={{ opacity: isOpen ? 0 : 1, scale: isOpen ? 1 : 1 }}
        transition={{ duration: 0.3 }}
        onClick={() => setIsOpen(true)}
        className="bg-yellow-400 shadow-xl text-black font-medium px-4 py-3 rounded-full flex items-center gap-2 hover:bg-yellow-400 dark:bg-yellow-500 dark:text-black transition delay-150 duration-300 ease-in-out hover:-translate-y-1 hover:scale-110 max-sm:mx-auto max-sm:mb-4"
        style={{ pointerEvents: isOpen ? 'none' : 'auto' }}
      >
        <span>Potřebuješ radu? Napiš!</span>
        <Image 
          src="/book-icon.svg" 
          alt="Book" 
          width={24} 
          height={24} 
          style={{ filter: 'brightness(0)' }}
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
            className="w-120 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col absolute bottom-0 right-0 max-sm:w-full max-sm:rounded-none max-sm:h-screen"
            style={{ height: '600px' }}
          >
            {/* Header */}
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

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  message={msg}
                  answer={answers[i]}
                  onLike={() => handleFeedback(i, true)}
                  onDislike={() => handleFeedback(i, false)}
                />
              ))}
              
              {isLoading && <LoadingIndicator messageIndex={waitingMessageIndex} />}
            </div>

            {/* Input */}
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={handleSendMessage}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
