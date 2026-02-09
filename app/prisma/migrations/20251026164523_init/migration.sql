-- CreateTable
CREATE TABLE "Prompt" (
    "promptId" SERIAL NOT NULL,
    "promptText" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "userFeedback" BOOLEAN,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("promptId")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "conversationId" SERIAL NOT NULL,
    "length" INTEGER NOT NULL,
    "userFeedback" BOOLEAN,
    "userFeedbackMessage" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("conversationId")
);

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("conversationId") ON DELETE RESTRICT ON UPDATE CASCADE;
