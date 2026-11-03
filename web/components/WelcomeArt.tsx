import { Hand, MessageSquare, Users } from "lucide-react";

export function WelcomeArt() {
  return <svg className="welcome-art" viewBox="0 0 400 152" aria-hidden="true" focusable="false">
    <path className="welcome-track" d="M66 108C118 108 116 70 158 70M242 70C284 70 290 52 328 52" />
    <path className="welcome-ink" pathLength="1" d="M66 108C118 108 116 70 158 70M242 70C284 70 290 52 328 52" />
    <circle className="welcome-orbit" cx="200" cy="70" r="64" />
    <circle className="welcome-node" cx="44" cy="108" r="22" />
    <MessageSquare x="34" y="98" width="20" height="20" strokeWidth="1.5" />
    <circle className="welcome-node" cx="350" cy="52" r="22" />
    <Users x="340" y="42" width="20" height="20" strokeWidth="1.5" />
    <g className="welcome-mark">
      <rect x="158" y="28" width="84" height="84" rx="24" />
      <Hand x="178" y="48" width="44" height="44" strokeWidth="1.5" />
    </g>
    <circle className="welcome-dot" cx="114" cy="89" r="4" />
    <circle className="welcome-dot" cx="282" cy="62" r="4" />
  </svg>;
}
