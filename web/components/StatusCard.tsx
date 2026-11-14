import { Check, CircleAlert, Clock, Loader, MapPin, RefreshCw } from "lucide-react";
import type { Status } from "@/lib/types";

// The resident's at-a-glance card. `live` marks it as the page's status region; previews pass false.
export function StatusCard({ status, kicker, title, arrival, place, area, when, stages, progressLabel, live = true }: { status: Status; kicker: string; title: string; arrival?: string; place: string; area: string; when: string; stages: string[]; progressLabel: string; live?: boolean }) {
  const confirmed = status === "confirmed" || status === "completed";
  const Icon = confirmed ? Check : status === "replanning" ? RefreshCw : status === "escalated" ? CircleAlert : Loader;
  const tone = confirmed ? "ok" : status === "escalated" || status === "replanning" ? "warn" : "live";
  const at = { parsing: 0, reviewing: 0, dispatching: 1, replanning: 1, escalated: 1, confirmed: 2, completed: 3 }[status];
  return <section className={`status-card tone-${tone}`} aria-label={kicker}>
    <div className="status-main" role={live ? "status" : undefined} aria-atomic={live || undefined}>
      <span className="status-icon" aria-hidden><Icon size={24} strokeWidth={2.4} /></span>
      <div><p className="status-kicker">{kicker}</p>{live ? <h1>{title}</h1> : <p className="status-title">{title}</p>}{arrival && <p className="arrival-text">{arrival}</p>}</div>
    </div>
    <div className="status-facts">
      <div className="fact"><MapPin size={18} aria-hidden /><span><strong>{place}</strong> <span className="fact-sub">{area}</span></span></div>
      <div className="fact"><Clock size={18} aria-hidden /><span className="num">{when}</span></div>
    </div>
    <ol className="dots" aria-label={progressLabel}>
      {stages.map((s, i) => <li key={s} className={i <= at ? "on" : ""} aria-current={i === at ? "step" : undefined}><span>{s}</span></li>)}
    </ol>
  </section>;
}
