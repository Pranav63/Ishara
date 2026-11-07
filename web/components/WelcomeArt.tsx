import { Bell, Clipboard, MessageSquare } from "lucide-react";

export function WelcomeArt() {
  return <svg className="welcome-art" viewBox="0 0 360 80" aria-hidden="true" focusable="false">
    <path className="welcome-track" d="M88 40H152M208 40H272" />
    <path className="welcome-ink welcome-send" pathLength="1" d="M88 40H152" />
    <path className="welcome-ink welcome-deliver" pathLength="1" d="M208 40H272" />
    <g className="welcome-step">
      <rect className="welcome-tile" x="32" y="12" width="56" height="56" rx="16" />
      <g className="welcome-symbol"><MessageSquare x="48" y="28" width="24" height="24" strokeWidth="1.5" /><path className="welcome-message" pathLength="1" d="M54 35h12M54 39h8" /></g>
    </g>
    <g className="welcome-step">
      <rect className="welcome-tile" x="152" y="12" width="56" height="56" rx="16" />
      <g className="welcome-symbol"><Clipboard x="168" y="28" width="24" height="24" strokeWidth="1.5" /><path className="welcome-check" pathLength="1" d="m175 41 3 3 6-7" /></g>
    </g>
    <g className="welcome-step">
      <rect className="welcome-tile" x="272" y="12" width="56" height="56" rx="16" />
      <Bell className="welcome-symbol" x="288" y="28" width="24" height="24" strokeWidth="1.5" />
    </g>
  </svg>;
}
