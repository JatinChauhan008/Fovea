import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fovea - adaptive speed reading",
  description:
    "Turn PDFs into a focused one-word-at-a-time reading experience that adapts to how well you actually retain what you read.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-text antialiased">
        <AuthProvider>
          <NavBar />
          <main className="mx-auto w-full max-w-6xl px-5 pb-20">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
