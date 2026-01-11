"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle } from "lucide-react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";

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
            className="w-96 md:w-[500px] lg:w-[600px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="bg-indigo-900 dark:bg-indigo-800 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-white text-indigo-900 p-1 rounded-full">
                  <MessageCircle size={22} />
                </div>
                <span className="font-semibold text-lg">Aleš Knihovník</span>
              </div>

              <button onClick={() => setIsOpen(false)}>
                <span className="text-white text-2xl">›</span>
              </button>
            </div>

            <div className="p-4 h-[500px] overflow-y-auto space-y-4 bg-gray-50 dark:bg-gray-800">
              {messages.map((msg, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="bg-gray-200 dark:bg-gray-700 text-black dark:text-white max-w-[80%] p-3 rounded-xl self-end">
                    {msg}
                  </div>
                  {answers[i] && (
                    <>
                      <div className="bg-indigo-900 dark:bg-indigo-700 text-white max-w-[80%] p-3 rounded-xl whitespace-pre-wrap">
                        {renderMarkdown(answers[i])}
                      </div>
                      <button className="bg-indigo-900 dark:bg-indigo-700 text-white px-3 py-1 rounded" onClick={handleLike}> like </button>
                      <button className="bg-indigo-900 dark:bg-indigo-700 text-white px-3 py-1 rounded" onClick={handleDisLike}> dislike  </button>
                    </>
                  
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-end p-3 bg-white dark:bg-gray-900 border-t dark:border-gray-700 gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Sem můžete psát..."
                rows={1}
                className="flex-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-hidden min-h-[40px] max-h-[120px]"
                style={{
                  height: `${Math.min(Math.max(40, input.split('\n').length * 24), 120)}px`
                }}
              />

              <button
                onClick={handleClick}
                className="bg-indigo-700 dark:bg-indigo-600 text-white p-3 rounded-full hover:bg-indigo-800 dark:hover:bg-indigo-500"
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
