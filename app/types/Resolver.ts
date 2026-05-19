import { AuthContext } from "./AuthContext";

export type Resolver<TArgs = unknown, TReturn = unknown> = (
    parent: unknown,
    args: TArgs,
    context: AuthContext,
) => TReturn;
