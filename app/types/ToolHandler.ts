import { ChatCompletionMessageParam } from "openai/resources/chat";

export type ToolHandler = (
    args: Record<string, unknown>,
    messages: ChatCompletionMessageParam[],
    toolCallId: string,
    functionName: string,
) => Promise<string>;
