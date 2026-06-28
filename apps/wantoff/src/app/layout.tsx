import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { NavBar } from "./nav-bar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Wantoff",
  description: "Manage your wants and offers across the network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <AuthProvider>
          <NavBar />
          {children}
          <footer className="footer">
            <Link href="/protocol">About the protocol</Link>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
