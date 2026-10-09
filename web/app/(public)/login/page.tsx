import LoginForm from "@/components/login/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | U2 Gas",
  description: "Make gas convenient - log in to your U2 Gas account",
};

export default function LoginPage() {
  return (
    <main className="w-full min-h-[calc(100vh-80px)] flex flex-col items-center bg-white overflow-x-hidden relative pb-12 select-none">
      <LoginForm />
    </main>
  );
}
