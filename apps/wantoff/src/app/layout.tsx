import type { Metadata } from "next";
import Link from "next/link";
import { AuthProvider } from "@/lib/auth-context";
import { NavBar } from "./nav-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wantoff",
  description: "Manage your wants and offers across the network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
