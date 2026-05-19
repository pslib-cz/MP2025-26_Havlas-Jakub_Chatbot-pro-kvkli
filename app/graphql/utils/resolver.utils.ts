import { GraphQLError } from "graphql";
import { authService } from "../services/auth.service";
import { AuthContext, Resolver } from "../../types";

export function requireAuth(context: AuthContext): void {
    if (!context.token || !authService.verifyToken(context.token)) {
        throw new GraphQLError("Unauthorized", {
            extensions: { code: "UNAUTHENTICATED" },
        });
    }
}

export function withAuth<TArgs, TReturn>(
    fn: Resolver<TArgs, TReturn>,
): Resolver<TArgs, TReturn> {
    return (parent, args, context) => {
        requireAuth(context);
        return fn(parent, args, context);
    };
}
