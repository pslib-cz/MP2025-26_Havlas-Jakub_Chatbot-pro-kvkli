import { authService } from "../services/auth.service";
import { GraphQLError } from "graphql";

export const authResolvers = {
    Query: {
        verifyToken: async (
            _: unknown,
            __: unknown,
            context: { token?: string },
        ) => {
            if (!context.token) return false;
            const user = authService.verifyToken(context.token);
            return !!user;
        },
        heartbeat: () => true,
    },
    Mutation: {
        login: async (
            _: unknown,
            { username, password }: { username: string; password: string },
        ) => {
            const token = authService.login(username, password);
            if (!token) {
                throw new GraphQLError("Invalid credentials", {
                    extensions: { code: "UNAUTHENTICATED" },
                });
            }
            return { token };
        },
    },
};
