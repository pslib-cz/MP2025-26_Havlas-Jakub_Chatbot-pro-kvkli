import type { ToolFunctionCall } from "./ToolFunctionCall";

export type ToolMessage = {
    function_call?: ToolFunctionCall | null;
    content?: string | null;
};
