-- AlterTable
ALTER TABLE "Prompt" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropForeignKey
ALTER TABLE "Prompt" DROP CONSTRAINT "Prompt_conversationId_fkey";

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("conversationId") ON DELETE CASCADE ON UPDATE CASCADE;
