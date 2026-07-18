import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "public" | "intern" | "researcher" | "admin";
      quotaTierId: number;
      storageUsedBytes: number;
      quotaExtraBytes: number;
    } & DefaultSession["user"];
  }
}
