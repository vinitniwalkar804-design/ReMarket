import { useState } from "react";
import { Scale, TrendingUp, TrendingDown, AlertTriangle, ChevronDown } from "lucide-react";

/**
 * Why the model assigned a cluster to this persona.
 *
 * The persona card states a conclusion - "Research-Heavy Buyer", 31% of
 * customers, spend here - and the pipeline already records how it got there:
 * which features contributed, how far the cluster sits from the population mean,
 * how confidently the label won, and which persona it beat. None of that was
 * being shown, so the card read as a marketing assertion the operator had to
 * take on faith.
 *
 * Everything rendered here comes from the stored persona document. When a field
 * is absent the corresponding line is omitted rather than defaulted, so a
 * pipeline run that produced no evidence shows an honest "no evidence recorded"
 * instead of a zeroed-out bar that looks like a measurement.
 */

const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;

const EvidenceRow = ({ item, maxContribution }) => {
  const contribution = Number(item.contribution) || 0;
  const width = maxContribution > 0 ? Math.max((Math.abs(contribution) / maxContribution) * 100, 2) : 0;
  const positive = contribution >= 0;

  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-ink-900">{item.label || item.name}</span>
        <span className={`text-2xs tabular flex-none ${positive ? "text-emerald-600" : "text-rose-600"}`}>
          {positive ? "+" : ""}
          {contribution.toFixed(2)}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 rounded-full bg-sunken overflow-hidden">
        <div
          className={`h-full rounded-full ${positive ? "bg-emerald-500/70" : "bg-rose-500/70"}`}
          style={{ width: `${width}%` }}
        />
      </div>

      <p className="mt-1 text-2xs text-muted tabular">
        cluster mean {Number(item.clusterMean).toFixed(1)} vs reference {Number(item.reference).toFixed(1)}
        {item.saturated && (
          <span
            className="ml-1.5 text-amber-600"
            title="Raw value is far above the reference; the score is capped so one extreme feature cannot dominate the label."
          >
            (capped)
          </span>
        )}
      </p>
    </li>
  );
};

const PersonaEvidence = ({ persona }) => {
  const [open, setOpen] = useState(false);
  const evidence = persona.evidence || [];
  const maxContribution = evidence.reduce((m, e) => Math.max(m, Math.abs(Number(e.contribution) || 0)), 0);
  const hasEvidence = evidence.length > 0;

  return (
    <div className="mt-4 rounded-xl border border-line bg-raised overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <Scale size={14} className="text-primary flex-none" />
        <span className="text-2xs font-bold uppercase tracking-[0.1em] text-ink-900">
          Why this persona
        </span>
        {persona.confidence != null && (
          <span className="text-2xs text-muted tabular">
            confidence {pct(persona.confidence)}
            {persona.marginOverRunnerUp != null && ` · +${Number(persona.marginOverRunnerUp).toFixed(2)} over runner-up`}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-auto text-muted flex-none transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-line space-y-4">
          {persona.isNamed === false && (
            <p className="text-2xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              This segment did not clear the evidence threshold for a named persona. It is shown
              as an unnamed segment rather than being given a descriptive label.
              {persona.namingReason ? ` Reason: ${persona.namingReason}` : ""}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 pt-3">
            <div>
              <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1">
                Scored evidence
              </p>
              {hasEvidence ? (
                <ul className="divide-y divide-line">
                  {evidence.map((item, i) => (
                    <EvidenceRow key={`${item.name}-${i}`} item={item} maxContribution={maxContribution} />
                  ))}
                </ul>
              ) : (
                <p className="text-2xs text-muted">No evidence recorded for this segment.</p>
              )}
            </div>

            <div className="space-y-4">
              {persona.alternatives?.length > 0 && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5">
                    Ran against
                  </p>
                  <ul className="space-y-1">
                    {persona.alternatives.map((alt) => {
                      const best = Number(persona.matchScore) || 0;
                      const score = Number(alt.score) || 0;
                      return (
                        <li key={alt.name} className="flex items-center gap-2 text-2xs">
                          <span className="text-ink-700 flex-1 truncate">{alt.name}</span>
                          <span className="h-1 w-16 rounded-full bg-sunken overflow-hidden flex-none">
                            <span
                              className="block h-full bg-white/25 rounded-full"
                              style={{ width: `${best > 0 ? Math.max((score / best) * 100, 3) : 0}%` }}
                            />
                          </span>
                          <span className="tabular text-muted w-10 text-right flex-none">{score.toFixed(1)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {persona.highFeatures?.length > 0 && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5 flex items-center gap-1">
                    <TrendingUp size={11} className="text-emerald-600" /> Above population
                  </p>
                  <ul className="space-y-0.5">
                    {persona.highFeatures.slice(0, 4).map((f) => (
                      <li key={f.name} className="flex items-baseline justify-between gap-2 text-2xs">
                        <span className="text-ink-700 truncate">{f.label || f.name}</span>
                        <span className="tabular text-emerald-600 flex-none">
                          {Number(f.clusterMean).toFixed(1)} vs {Number(f.populationMean).toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {persona.lowFeatures?.length > 0 && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5 flex items-center gap-1">
                    <TrendingDown size={11} className="text-rose-500" /> Below population
                  </p>
                  <ul className="space-y-0.5">
                    {persona.lowFeatures.slice(0, 4).map((f) => (
                      <li key={f.name} className="flex items-baseline justify-between gap-2 text-2xs">
                        <span className="text-ink-700 truncate">{f.label || f.name}</span>
                        <span className="tabular text-rose-500 flex-none">
                          {Number(f.clusterMean).toFixed(1)} vs {Number(f.populationMean).toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {persona.counterSignals?.length > 0 && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5 flex items-center gap-1">
                    <AlertTriangle size={11} className="text-amber-600" /> Counted against
                  </p>
                  <ul className="space-y-0.5">
                    {persona.counterSignals.map((label) => (
                      <li key={label} className="text-2xs text-ink-700">
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonaEvidence;
