import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      tier: string;
      tradingRole?: string;
      totpEnabled?: boolean;
    };
  }
  interface User {
    role?: string;
    tier?: string;
    tradingRole?: string;
    totpEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    tier?: string;
    tradingRole?: string;
    totpEnabled?: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please provide both email and password");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { tradingProfile: true },
        });

        if (!user) {
          throw new Error("No account found with this email");
        }

        if (!user.hashedPassword) {
          throw new Error("Please use Google sign-in or reset your password");
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        );
        if (!isValid) {
          throw new Error("Incorrect password");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name || "",
          role: user.role,
          tier: user.tier,
          tradingRole: user.tradingProfile?.tradingRole || "INVESTOR",
          totpEnabled: user.tradingProfile?.totpEnabled || false,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        token.tier = user.tier;
        token.tradingRole = user.tradingRole;
        token.totpEnabled = user.totpEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
        session.user.tier = token.tier as string;
        session.user.tradingRole = token.tradingRole as string;
        session.user.totpEnabled = token.totpEnabled as boolean;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
          include: { tradingProfile: true },
        });

        if (existingUser && !existingUser.tradingProfile) {
          await prisma.tradingProfile.create({
            data: {
              userId: existingUser.id,
              tradingRole: "INVESTOR",
            },
          });
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
