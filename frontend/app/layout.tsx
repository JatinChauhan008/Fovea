import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Literata } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});
const serif = Literata({ subsets: ["latin"], variable: "--font-literata" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Fovea",
  description: "Read PDFs one word at a time.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <AuthProvider>
          <NavBar />
          {/* Pages add their own bottom space, so the reader can fill exactly one screen. */}
          <main className="mx-auto w-full max-w-4xl px-5 sm:px-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
