"use client";

import { useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";
import { clock } from "@/lib/format";
import type { Arrival } from "@/lib/types";

export function ArrivalControls({ token, requestId, arrival, onDone }: { token: string; requestId: string; arrival: Arrival | null; onDone: () => void }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share(minutes: number) {
    setBusy(true);
    setError(null);
    try {
      await api.arrival(token, requestId, minutes);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="arrival-controls" aria-label={t("Share your arrival time", "شارك وقت وصولك")}>
      <h3>{t("Share your arrival time", "شارك وقت وصولك")}</h3>
      <p className="small muted" role="status" aria-atomic="true">
        {arrival ? arrival.arrived ? t("You reported that you have arrived.", "أبلغت عن وصولك.") : t(`You shared an estimated arrival of ${clock(arrival.eta)}.`, `شاركت وقت وصول متوقعاً الساعة ${clock(arrival.eta)}.`) : t("Tell the resident when to expect you. This is your estimate, without GPS tracking.", "أبلغ طالب الخدمة بوقت وصولك المتوقع. هذا تقديرك، دون تتبع الموقع.")}
      </p>
      <div className="arrival-actions">
        {[5, 10, 15].map((minutes) => <button key={minutes} className="btn small" disabled={busy} onClick={() => share(minutes)} aria-label={t(`I will arrive in ${minutes} minutes`, `سأصل خلال ${minutes} دقيقة`)}>{minutes} {t("min", "دقيقة")}</button>)}
        <button className="btn small primary" disabled={busy} onClick={() => share(0)}>{t("I have arrived", "وصلت")}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
