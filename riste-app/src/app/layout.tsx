import "./globals.css";
import type { ReactNode } from "react";
import { getSetting } from "@/lib/settings";

export const metadata = {
  title: "Riste AI",
  description: "Keep your important people warm — automatically.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { killSwitch } = await getSetting();
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
            <a href="/metrics">Metrics</a>
            <a href="/settings">Settings</a>
          </nav>
          {killSwitch && (
            <div className="pause-banner" role="status">
              <span>⏸ Sending is paused. Nothing is drafted or sent.</span>
              <a href="/settings">Resume in Settings</a>
            </div>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
