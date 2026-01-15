"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle, ChevronRight } from "lucide-react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import Image from "next/image";

// Helper function to render markdown-style text
function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const content = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-lg">
          {content}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

const ADD_PROMPT = gql`
  mutation AddPrompt($promptText: String!, $conversationId: Int) {
    addPrompt(promptText: $promptText, conversationId: $conversationId) {
      conversationId
      prompt {
        promptId
        promptText
        answerText
        userFeedback
        conversationId
      }
    }
  }
`;

const ADD_PROMPT_FEEDBACK = gql`
mutation AddPromptFeedback($conversationId: Int!, $promptNth: Int!, $userFeedback: Boolean!) {
addPromptFeedback(conversationId: $conversationId, promptNth: $promptNth, userFeedback: $userFeedback) {
promptId
userFeedback
}
}
`;

type FeedbackData = {
  addPrompt: {
    conversationId: number;
    promptNth: number;
    userFeedback: boolean;
  };
};

type addPromptData = {
  addPrompt: {
    conversationId: number;
    prompt: {
      promptId: number;
      promptText: string;
      answerText: string;
    };
  };
};

export default function Chatbot() {
  const [addPromptMutation] =
    useMutation<addPromptData, { promptText: string; conversationId?: number | null }>(ADD_PROMPT);
  const [addPromptFeedbackMutation] =
    useMutation<FeedbackData>(ADD_PROMPT_FEEDBACK);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);

  const handleClick = async () => {
    if (!input.trim()) return;
    
    const messageToSend = input;
    setInput("");
    setMessages((prev) => [...prev, messageToSend]);

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
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleClick();
    }
  };
  const  handleLike = async () => {
      await addPromptFeedbackMutation({
        variables: {
          conversationId: conversationId!,
          promptNth: messages.length - 1,
          userFeedback: true,
        },
      });
  };

  const  handleDisLike = async () => {
 await addPromptFeedbackMutation({
        variables: {
          conversationId: conversationId!,
          promptNth: messages.length - 1,
          userFeedback: false,
        },
      });
  };
  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-yellow-400 shadow-xl text-black font-medium px-4 py-3 rounded-full flex items-center gap-2 hover:bg-yellow-500 dark:bg-yellow-500 dark:text-black"
        >
          <span>Potřebuješ radu? Napiš!</span>
          <MessageCircle size={22} />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="w-96 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ height: '600px' }}
          >
            {/* Header */}
            <div className="bg-[#3d4b6e] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-full">
                  <Image src="/public/book-icon.svg" alt="Book" width={24} height={24} />
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
                <div key={i} className="space-y-3">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="bg-gray-200 text-black max-w-[75%] p-3 rounded-2xl rounded-tr-sm">
                      {msg}
                    </div>
                  </div>
                  
                  {/* Bot response */}
                  {answers[i] && (
                    <div className="flex gap-2 items-start">
                      <div className="bg-[#4a5a7f] text-white p-2 rounded-full flex-shrink-0 mt-1">
                        <Image src="/public/dots-icon.svg" alt="Bot" width={20} height={20} />
                      </div>
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="bg-[#3d4b6e] text-white max-w-[85%] p-3 rounded-2xl rounded-tl-sm whitespace-pre-wrap">
                          {renderMarkdown(answers[i])}
                        </div>
                        <div className="flex gap-2 items-center">
                          <button 
                            onClick={handleLike}
                            className="hover:bg-gray-200 p-1 rounded"
                          >
                            <Image src="/public/thumbs-up.svg" alt="Like" width={16} height={16} />
                          </button>
                          <button 
                            onClick={handleDisLike}
                            className="hover:bg-gray-200 p-1 rounded"
                          >
                            <Image src="/public/thumbs-down.svg" alt="Dislike" width={16} height={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input area */}
            <div className="flex items-center p-3 bg-[#3d4b6e] gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleClick();
                  }
                }}
                placeholder="Sem můžete psát..."
                className="flex-1 p-3 rounded-full bg-[#4a5a7f] text-white placeholder-gray-300 border-none outline-none"
              />

              <button
                onClick={handleClick}
                className="bg-[#4a5a7f] text-white p-3 rounded-full hover:bg-[#5a6a8f]"
              >
                <Send size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
