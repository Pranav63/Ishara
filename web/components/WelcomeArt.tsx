import { Bell, ClipboardCheck, MessageSquare } from "lucide-react";

export function WelcomeArt() {
  return <svg className="welcome-art" viewBox="0 0 360 80" aria-hidden="true" focusable="false">
    <path className="welcome-track" d="M88 40H152M208 40H272" />
    <path className="welcome-ink" pathLength="1" d="M88 40H152M208 40H272" />
    <rect className="welcome-tile" x="32" y="12" width="56" height="56" rx="16" />
    <MessageSquare x="48" y="28" width="24" height="24" strokeWidth="1.5" />
    <g className="welcome-mark">
      <rect className="welcome-tile" x="152" y="12" width="56" height="56" rx="16" />
      <ClipboardCheck x="168" y="28" width="24" height="24" strokeWidth="1.5" />
    </g>
    <rect className="welcome-tile" x="272" y="12" width="56" height="56" rx="16" />
    <Bell x="288" y="28" width="24" height="24" strokeWidth="1.5" />
  </svg>;
}
