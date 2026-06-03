import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Riste AI",
  description: "Keep your important people warm — automatically.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <nav className="nav">
            <h1>🪔 Riste AI</h1>
            <span className="grow" />
            <a href="/">Activity</a>
            <a href="/contacts">Contacts</a>
            <a href="/calendar">Calendar</a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
