import type { ToolFunctionCall } from "./ToolFunctionCall";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat";

export type ToolMessage = {
    tool_calls?: ChatCompletionMessageToolCall[] | null;
    function_call?: ToolFunctionCall | null;
    content?: string | null;
};
