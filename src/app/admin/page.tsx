import { getRecentRuns, getTotals, getPerSourceBreakdown, getRecentFailures } from "@/lib/admin-data";

/**
 * Dashboard `/admin` — server component (RSC). Wszystkie queries są
 * service-role (zob. `src/lib/admin-data.ts`). Dostęp chroniony Basic Auth
 * w `src/proxy.ts`. Brak danych przekazywanych do client — całość renderuje
 * się na serwerze. Brak interaktywności == brak `"use client"` i brak
 * powierzchni ataku po stronie przeglądarki.
 */
export default async function AdminPage() {
  const [runs, totals7d, sources7d, failures] = await Promise.all([
    getRecentRuns(10),
    getTotals(7),
    getPerSourceBreakdown(7),
    getRecentFailures(15),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-heading font-extrabold tracking-tight mb-1">
          Dashboard pipeline&apos;u
        </h1>
        <p className="text-sm text-muted-foreground">
          Telemetria z <code>pipeline_events</code> · ostatnie 7 dni. Dane odświeżane przy każdej wizycie (revalidate=0).
        </p>
      </section>

      {/* 7-day totals */}
      <section>
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Ostatnie 7 dni
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Runów" value={String(totals7d.runs)} />
          <Metric label="Wygenerowanych" value={String(totals7d.generated)} accent />
          <Metric label="Odrzuconych" value={String(totals7d.rejected)} />
          <Metric label="Failed" value={String(totals7d.failed)} />
          <Metric label="Aborted" value={String(totals7d.aborted)} />
          <Metric
            label="Koszt AI (USD)"
            value={totals7d.costUsd > 0 ? `$${totals7d.costUsd.toFixed(4)}` : "—"}
          />
        </div>
        {totals7d.avgDurationMs !== null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Średni czas runa: <span className="font-mono">{Math.round(totals7d.avgDurationMs / 1000)}s</span>
          </p>
        )}
      </section>

      {/* Recent runs */}
      <section>
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Ostatnie runy (10)
        </h2>
        {runs.length === 0 ? (
          <EmptyHint text="Brak runów w bazie pipeline_events. Albo cron jeszcze nie wystartował, albo migracja 003 nie została zastosowana." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Start (UTC)</th>
                  <th className="px-3 py-2 text-right">Czas</th>
                  <th className="px-3 py-2 text-right">Żądane</th>
                  <th className="px-3 py-2 text-right">OK</th>
                  <th className="px-3 py-2 text-right">Reject</th>
                  <th className="px-3 py-2 text-right">Fail</th>
                  <th className="px-3 py-2 text-right">Aborted</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {runs.map((r) => (
                  <tr key={r.runId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {formatTimestamp(r.startedAt)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {r.durationMs !== null ? `${Math.round(r.durationMs / 1000)}s` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.countRequested ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-primary">{r.generated}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.rejected}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.failed}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.aborted}</td>
                    <td className="px-3 py-2">
                      {r.complete ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-primary">
                          ok
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                          partial
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per source */}
      <section>
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Per źródło (7 dni)
        </h2>
        {sources7d.length === 0 ? (
          <EmptyHint text="Brak danych per-source. Pojawią się po pierwszym udanym cronie." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Źródło RSS</th>
                  <th className="px-3 py-2 text-right">Wygenerowano</th>
                  <th className="px-3 py-2 text-right">Odrzucono</th>
                  <th className="px-3 py-2 text-right">Pomięto/Błąd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sources7d.map((s) => (
                  <tr key={s.sourceName} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">{s.sourceName}</td>
                    <td className="px-3 py-2 text-right font-mono text-primary">{s.generated}</td>
                    <td className="px-3 py-2 text-right font-mono">{s.rejected}</td>
                    <td className="px-3 py-2 text-right font-mono">{s.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent failures */}
      <section>
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Ostatnie odrzucenia / błędy (15)
        </h2>
        {failures.length === 0 ? (
          <EmptyHint text="Brak rejected/failed events — wszystko działa." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Czas (UTC)</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Tytuł</th>
                  <th className="px-3 py-2 text-left">Źródło</th>
                  <th className="px-3 py-2 text-left">Powód</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {failures.map((f, i) => (
                  <tr key={`${f.createdAt}-${i}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {formatTimestamp(f.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{f.event}</td>
                    <td className="px-3 py-2 max-w-[24rem] truncate" title={f.title}>
                      {f.title}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{f.sourceName}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[20rem] truncate" title={f.reason}>
                      {f.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-heading text-2xl font-extrabold tracking-tight ${accent ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  // YYYY-MM-DD HH:MM:SS (UTC) — czytelne, sortowalne, bez lokalizacji.
  return d.toISOString().replace("T", " ").slice(0, 19);
}
