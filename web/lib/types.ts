export type Status = "parsing" | "reviewing" | "dispatching" | "confirmed" | "replanning" | "escalated" | "completed";

export interface Appointment {
  entity: string;
  area: string;
  starts_at: number;
  duration_min: number;
  domain: string;
  language: string;
  assumed: string[];
  source: "llm" | "rules";
}

export interface Interp {
  id: string;
  name: string;
  area: string;
  certified: boolean;
  languages: string[];
  domains: string[];
  reliability: number;
  token?: string;
  tg_link?: string;
}

export interface Offer {
  id: number;
  request_id: string;
  interpreter_id: string;
  role: "primary" | "standby";
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn" | "cancelled" | "standby";
  wave: number;
  sent_at: number;
  expires_at: number;
  travel_min: number;
  reasons: string[];
}

export interface Ev {
  id: number;
  request_id: string;
  ts: number;
  kind: string;
  actor: string;
  payload: { text: string };
}

export interface Bilingual {
  en: string;
  ar: string | null;
}

export interface Briefing {
  arrive_by: number;
  leave_by: number;
  travel_min: number;
  vocabulary: string[];
  practice: string[];
  logistics: string[];
}

export interface Arrival {
  eta: number;
  updated_at: number;
  arrived: boolean;
}

export interface Snapshot {
  now: number;
  id: string;
  token: string;
  status: Status;
  created_at: number;
  requester_name: string;
  message: string;
  appointment: Appointment;
  assigned: Interp | null;
  confirmation: Bilingual | null;
  summary: Bilingual | null;
  arrival: Arrival | null;
  confirmation_video_url: string | null;
  remote_interpreter_url: string | null;
  escalation?: { status: "pending" | "acknowledged"; created_at: number; acknowledged_at: number | null; note: string | null } | null;
  offers?: Offer[];
  briefing?: Briefing | null;
  events?: Ev[];
}

export interface Metrics {
  requests: number;
  filled: number;
  median_confirm_s: number | null;
  replans: number;
}

export interface InterpreterView {
  now: number;
  interpreter: Interp;
  items: {
    offer: Offer;
    request: { id: string; status: Status; appointment: Appointment; requester_name: string };
    briefing: Briefing | null;
    arrival: Arrival | null;
  }[];
}

export interface Config {
  llm: string;
  offer_ttl_s: number;
  demo: boolean;
  telegram: string | null;
  operator_auth_required: boolean;
  languages?: string[];
  domains?: string[];
}
