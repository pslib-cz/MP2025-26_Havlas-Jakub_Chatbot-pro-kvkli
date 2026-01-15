import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server';
import { typeDefs } from '../../../../graphql/schema';
import { resolvers } from '../../../../graphql/resolvers';
import { prisma } from '../../../../lib/prisma';

export const runtime = 'nodejs';

let handler: ReturnType<typeof startServerAndCreateNextHandler> | null = null;

function getHandler() {
  if (!handler) {
    const server = new ApolloServer({
      typeDefs,
      resolvers,
    });

    handler = startServerAndCreateNextHandler(server, {
      context: async () => ({ prisma }),
    });
  }

  return handler;
}

export async function GET(request: NextRequest) {
  return getHandler()(request);
}

export async function POST(request: NextRequest) {
  return getHandler()(request);
}
