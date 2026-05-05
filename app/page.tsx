"use client";

import { useState, useRef } from "react";
import { runAlgorithm, redact, AllergySeverity, RenalFunction, Mucositis, Bundle } from "@/lib/algorithm";

type DecisionState = "pending" | "signed" | "overridden";
type NodeStatus = "idle" | "active" | "complete";

interface CascadeLine {
  label: string;
  detail?: string;
  category: string;
  status: "pending" | "confirmed";
}

export default function Home() {
  const [anc, setAnc] = useState<string>("");
  const [temp, setTemp] = useState<string>("");
  const [sustained, setSustained] = useState<boolean>(false);

  const [hemodynamicallyStable, setHemodynamicallyStable] = useState<boolean>(true);
  const [penicillinAllergy, setPenicillinAllergy] = useState<AllergySeverity>("none");
  const [mrsa, setMrsa] = useState<boolean>(false);
  const [vre, setVre] = useState<boolean>(false);
  const [esbl, setEsbl] = useState<boolean>(false);
  const [kpc, setKpc] = useState<boolean>(false);
  const [renalFunction, setRenalFunction] = useState<RenalFunction>("normal");
  const [catheterPresent, setCatheterPresent] = useState<boolean>(false);
  const [mucositis, setMucositis] = useState<Mucositis>("none");

  const [speech, setSpeech] = useState<string>("");
  const [speechLoading, setSpeechLoading] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechRequested, setSpeechRequested] = useState<boolean>(false);
  const [bundleAtRequest, setBundleAtRequest] = useState<Bundle | null>(null);

  const [decision, setDecision] = useState<DecisionState>("pending");

  const [cascade, setCascade] = useState<CascadeLine[]>([]);
  const [cascadeComplete, setCascadeComplete] = useState<boolean>(false);

  const [closing, setClosing] = useState<string>("");
  const [closingLoading, setClosingLoading] = useState<boolean>(false);

  const [overrideReason, setOverrideReason] = useState<string>("");

  const speechAbortRef = useRef<AbortController | null>(null);

  const ancNum = parseFloat(anc);
  const tempNum = parseFloat(temp);
  const ancValid = !isNaN(ancNum) && ancNum >= 0;
  const tempValid = !isNaN(tempNum) && tempNum > 0;

  const ancCriteriaMet = ancValid && ancNum < 500;
  const tempThreshold = sustained ? 38.0 : 38.3;
  const tempCriteriaMet = tempValid && tempNum >= tempThreshold;
  const criteriaMet = ancCriteriaMet && tempCriteriaMet;

  const bundle: Bundle | null = criteriaMet
    ? redact(
        runAlgorithm({
          anc: ancNum,
          temp: tempNum,
          sustained,
          hemodynamicallyStable,
          penicillinAllergy,
          mrsa,
          vre,
          esbl,
          kpc,
          renalFunction,
          catheterPresent,
          mucositis,
        })
      )
    : null;

  if (!criteriaMet && (speechRequested || decision !== "pending")) {
    if (speechAbortRef.current) speechAbortRef.current.abort();
    setSpeech("");
    setSpeechError(null);
    setSpeechRequested(false);
    setBundleAtRequest(null);
    setDecision("pending");
    setCascade([]);
    setCascadeComplete(false);
    setClosing("");
    setOverrideReason("");
  }

  async function handleGetSecondOpinion() {
    if (!bundle) return;

    if (speechAbortRef.current) speechAbortRef.current.abort();
    const controller = new AbortController();
    speechAbortRef.current = controller;

    setSpeech("");
    setSpeechError(null);
    setSpeechRequested(true);
    setBundleAtRequest(bundle);
    setDecision("pending");
    setCascade([]);
    setCascadeComplete(false);
    setClosing("");
    setOverrideReason("");
    setSpeechLoading(true);

    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errText = await response.text();
        setSpeechError(errText || "Unable to generate speech.");
        setSpeechLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setSpeech((prev) => prev + chunk);
      }

      setSpeechLoading(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSpeechError(err instanceof Error ? err.message : "Unknown error");
      setSpeechLoading(false);
    }
  }

  function buildCascadeLines(b: Bundle): CascadeLine[] {
    const lines: CascadeLine[] = [];

    b.cultures.forEach((c) => {
      lines.push({ label: c.label, detail: c.detail, category: "Cultures", status: "pending" });
    });

    b.antibiotics.forEach((a) => {
      lines.push({
        label: `${a.agent} — ${a.route}, ${a.doseShape}${a.stat ? " (STAT)" : ""}`,
        detail: a.notes,
        category: "Antibiotics",
        status: "pending",
      });
    });

    b.ancillary.forEach((a) => {
      lines.push({ label: a.label, detail: a.detail, category: "Ancillary", status: "pending" });
    });

    b.nursing.forEach((n) => {
      lines.push({ label: n.label, detail: n.detail, category: "Nursing", status: "pending" });
    });

    b.pharmacy.forEach((p) => {
      lines.push({ label: p.label, detail: p.detail, category: "Pharmacy", status: "pending" });
    });

    b.reconciliation.forEach((r) => {
      lines.push({ label: r.label, detail: r.detail, category: "Reconciliation", status: "pending" });
    });

    return lines;
  }

  async function handleSign() {
    if (!bundleAtRequest) return;
    setDecision("signed");

    const lines = buildCascadeLines(bundleAtRequest);
    setCascade(lines.map((l) => ({ ...l, status: "pending" })));

    const lineDelay = 600;

    for (let i = 0; i < lines.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, lineDelay));
      setCascade((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "confirmed" };
        return next;
      });
    }

    setCascadeComplete(true);

    setClosingLoading(true);
    try {
      const response = await fetch("/api/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle: bundleAtRequest }),
      });

      if (!response.ok || !response.body) {
        setClosingLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setClosing((prev) => prev + chunk);
      }
    } catch {
      // silent
    } finally {
      setClosingLoading(false);
    }
  }

  function handleOverride() {
    setDecision("overridden");
  }

  function loadExample() {
    setAnc("200");
    setTemp("38.5");
    setSustained(false);
    setHemodynamicallyStable(true);
    setPenicillinAllergy("none");
    setMrsa(false);
    setVre(false);
    setEsbl(false);
    setKpc(false);
    setRenalFunction("normal");
    setCatheterPresent(true);
    setMucositis("mild");
    setSpeech("");
    setSpeechError(null);
    setSpeechRequested(false);
    setBundleAtRequest(null);
    setDecision("pending");
    setCascade([]);
    setCascadeComplete(false);
    setClosing("");
    setOverrideReason("");
  }

  const bundleChangedSinceRequest =
    speechRequested &&
    bundleAtRequest &&
    bundle &&
    JSON.stringify(bundle) !== JSON.stringify(bundleAtRequest);

  const inputStatus: NodeStatus = criteriaMet ? "complete" : ancValid || tempValid ? "active" : "idle";
  const algorithmStatus: NodeStatus = criteriaMet ? "complete" : "idle";
  const claudeStatus: NodeStatus = speechLoading
    ? "active"
    : speech && !speechError
    ? "complete"
    : "idle";
  const clinicianStatus: NodeStatus =
    decision !== "pending" ? "complete" : speech && !speechLoading ? "active" : "idle";

  return (
    <main className="min-h-screen">
      <div className="border-b border-[var(--border)] bg-[var(--background)]/95 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-8 py-4 overflow-x-auto">
          <div className="flex items-center gap-4 text-sm font-[family-name:var(--font-mono)] whitespace-nowrap min-w-max">
            <StatusNode label="input" status={inputStatus} />
            <Arrow />
            <StatusNode label="algorithm" status={algorithmStatus} />
            <Arrow />
            <StatusNode label="claude-sonnet-4-5" status={claudeStatus} />
            <Arrow />
            <StatusNode label="clinician" status={clinicianStatus} />
          </div>
        </div>
      </div>

      <div className="px-8 pb-16">
        <div className="max-w-3xl mx-auto">
          <header className="mb-16 pt-16 text-center">
            <h1 className="font-[family-name:var(--font-sans)] text-5xl font-light tracking-[0.15em] mb-6 text-[var(--text)]">
              Lowfire
            </h1>
            <p className="font-[family-name:var(--font-serif)] italic text-xl text-[var(--text-muted)]">
              An experiment in AI as a clinical second opinion
            </p>
          </header>

          <section className="mb-12">
            <p className="text-lg leading-relaxed text-[var(--text)]">
              Most EHRs surface a critical lab abnormality and stop there. The clinician still has to recognize
              the pattern, recall the guideline, and translate it into orders, often under time pressure.
              Lowfire is a small experiment in what comes after the alert: a deterministic algorithm produces
              the orders, an AI voices the recommendation as a colleague would, and the clinician decides.
            </p>
          </section>

          <section className="mb-12 px-5 py-4 border border-[var(--border)] bg-[var(--surface)] rounded">
            <p className="text-sm leading-relaxed text-[var(--text-muted)] font-[family-name:var(--font-sans)]">
              All drug names redacted to class level. No real orders placed. No clinical use.
              The deterministic algorithm encodes IDSA / ASCO neutropenic fever guidelines.
            </p>
          </section>

          <section className="mb-8">
            <button
              onClick={loadExample}
              className="font-[family-name:var(--font-sans)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border-strong)] hover:border-[var(--text-muted)] rounded px-4 py-2 transition-colors"
            >
              Load example case →
            </button>
          </section>

          <section className="mb-10">
            <h2 className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-5">
              Inputs
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm text-[var(--text)] mb-2 font-[family-name:var(--font-sans)]">
                  Absolute neutrophil count (ANC)
                </label>
                <div className="flex items-baseline gap-3">
                  <input
                    type="number"
                    value={anc}
                    onChange={(e) => setAnc(e.target.value)}
                    placeholder="e.g. 200"
                    className="bg-[var(--surface)] border border-[var(--border-strong)] rounded px-3 py-2 w-40 text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)] font-[family-name:var(--font-sans)]"
                  />
                  <span className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-sans)]">cells/mm³</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--text)] mb-2 font-[family-name:var(--font-sans)]">
                  Temperature
                </label>
                <div className="flex items-baseline gap-3">
                  <input
                    type="number"
                    step="0.1"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    placeholder="e.g. 38.5"
                    className="bg-[var(--surface)] border border-[var(--border-strong)] rounded px-3 py-2 w-40 text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)] font-[family-name:var(--font-sans)]"
                  />
                  <span className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-sans)]">°C</span>
                </div>
                <label className="flex items-center gap-2 mt-3 text-sm text-[var(--text-muted)] cursor-pointer font-[family-name:var(--font-sans)]">
                  <input
                    type="checkbox"
                    checked={sustained}
                    onChange={(e) => setSustained(e.target.checked)}
                    className="accent-[var(--accent-amber)]"
                  />
                  Sustained ≥ 38.0°C for at least one hour
                </label>
              </div>
            </div>
          </section>

          {criteriaMet && (
            <section className="mb-10 p-5 border-l-2 border-[var(--accent-amber)] bg-[var(--accent-amber-bg)]">
              <p className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--accent-amber)] mb-2">
                Trigger
              </p>
              <p className="text-base text-[var(--text)]">
                Criteria met for empiric antibiotic coverage.
              </p>
              <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-muted)] mt-2">
                ANC {ancNum} cells/mm³ · Temperature {tempNum.toFixed(1)}°C
                {sustained && " (sustained)"}
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-3 font-[family-name:var(--font-sans)] italic">
                Continue with patient modifiers below to compose the case.
              </p>
            </section>
          )}

          {criteriaMet && (
            <section className="mb-10">
              <h2 className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-5">
                Patient modifiers
              </h2>

              <div className="space-y-5 font-[family-name:var(--font-sans)]">
                <div>
                  <label className="block text-sm text-[var(--text)] mb-2">Hemodynamic status</label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={hemodynamicallyStable} onChange={() => setHemodynamicallyStable(true)} className="accent-[var(--accent-amber)]" />
                      Stable
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={!hemodynamicallyStable} onChange={() => setHemodynamicallyStable(false)} className="accent-[var(--accent-amber)]" />
                      Unstable
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text)] mb-2">Penicillin allergy</label>
                  <select
                    value={penicillinAllergy}
                    onChange={(e) => setPenicillinAllergy(e.target.value as AllergySeverity)}
                    className="bg-[var(--surface)] border border-[var(--border-strong)] rounded px-3 py-2 text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)]"
                  >
                    <option value="none">None</option>
                    <option value="mild">Mild (rash, GI)</option>
                    <option value="severe">Severe (anaphylaxis)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text)] mb-3">Recent MDR colonization</label>
                  <div className="space-y-2 pl-1">
                    <label className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                      <input type="checkbox" checked={mrsa} onChange={(e) => setMrsa(e.target.checked)} className="accent-[var(--accent-amber)]" />
                      MRSA
                      <span className="text-xs text-[var(--text-subtle)] ml-1">— adds glycopeptide coverage</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                      <input type="checkbox" checked={vre} onChange={(e) => setVre(e.target.checked)} className="accent-[var(--accent-amber)]" />
                      VRE
                      <span className="text-xs text-[var(--text-subtle)] ml-1">— substitutes oxazolidinone (vancomycin ineffective)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                      <input type="checkbox" checked={esbl} onChange={(e) => setEsbl(e.target.checked)} className="accent-[var(--accent-amber)]" />
                      ESBL
                      <span className="text-xs text-[var(--text-subtle)] ml-1">— escalates β-lactam to carbapenem</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                      <input type="checkbox" checked={kpc} onChange={(e) => setKpc(e.target.checked)} className="accent-[var(--accent-amber)]" />
                      KPC
                      <span className="text-xs text-[var(--text-subtle)] ml-1">— requires β-lactam-inhibitor combination</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text)] mb-2">Renal function</label>
                  <select
                    value={renalFunction}
                    onChange={(e) => setRenalFunction(e.target.value as RenalFunction)}
                    className="bg-[var(--surface)] border border-[var(--border-strong)] rounded px-3 py-2 text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)]"
                  >
                    <option value="normal">Normal</option>
                    <option value="impaired">Impaired</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                    <input type="checkbox" checked={catheterPresent} onChange={(e) => setCatheterPresent(e.target.checked)} className="accent-[var(--accent-amber)]" />
                    Indwelling central catheter present
                  </label>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text)] mb-2">Mucositis</label>
                  <select
                    value={mucositis}
                    onChange={(e) => setMucositis(e.target.value as Mucositis)}
                    className="bg-[var(--surface)] border border-[var(--border-strong)] rounded px-3 py-2 text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)]"
                  >
                    <option value="none">None</option>
                    <option value="mild">Mild</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {criteriaMet && bundle && !speechRequested && (
            <section className="mb-10">
              <button
                onClick={handleGetSecondOpinion}
                className="font-[family-name:var(--font-sans)] px-6 py-3 bg-[var(--text)] text-[var(--background)] rounded text-sm font-medium hover:bg-black transition-colors"
              >
                Get second opinion →
              </button>
              <p className="text-xs text-[var(--text-subtle)] mt-3 font-[family-name:var(--font-sans)]">
                Sends the composed case to claude-sonnet-4-5 to voice the recommendation.
              </p>
            </section>
          )}

          {speechRequested && (
            <section className="mb-10">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Second opinion
                </h2>
                <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-subtle)]">
                  claude-sonnet-4-5
                </span>
              </div>

              <div className="p-6 border border-[var(--border)] bg-[var(--surface)] rounded min-h-[140px]">
                {speechError && <p className="text-sm text-[var(--accent-red)] font-[family-name:var(--font-sans)]">{speechError}</p>}
                {!speechError && (
                  <p className="text-lg text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                    {speech}
                    {speechLoading && (
                      <span className="inline-block w-2 h-4 bg-[var(--text-muted)] ml-1 animate-pulse align-middle" />
                    )}
                  </p>
                )}
              </div>

              {bundleChangedSinceRequest && !speechLoading && (
                <p className="text-xs text-[var(--text-subtle)] mt-3 font-[family-name:var(--font-sans)] italic">
                  Modifiers changed since this opinion was generated.{" "}
                  <button
                    onClick={handleGetSecondOpinion}
                    className="underline hover:text-[var(--text)]"
                  >
                    Regenerate
                  </button>
                </p>
              )}
            </section>
          )}

          {speechRequested && !speechLoading && !speechError && speech && decision === "pending" && (
            <section className="mb-10">
              <p className="text-xs text-[var(--text-subtle)] mb-3 font-[family-name:var(--font-sans)]">
                Demonstration only — no real orders will be placed.
              </p>
              <div className="flex gap-3 font-[family-name:var(--font-sans)]">
                <button
                  onClick={handleSign}
                  className="px-6 py-2.5 bg-[var(--text)] text-[var(--background)] rounded text-sm font-medium hover:bg-black transition-colors"
                >
                  Sign
                </button>
                <button
                  onClick={handleOverride}
                  className="px-6 py-2.5 bg-transparent border border-[var(--border-strong)] text-[var(--text)] rounded text-sm font-medium hover:border-[var(--text-muted)] transition-colors"
                >
                  Override
                </button>
              </div>
            </section>
          )}

          {decision === "signed" && cascade.length > 0 && (
            <section className="mb-10">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--accent-green)]">
                  Orders signed
                </h2>
                <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-subtle)]">simulated</span>
              </div>

              <div className="p-5 border border-[var(--border-strong)] bg-[var(--surface-cascade)] rounded font-[family-name:var(--font-mono)] text-sm">
                {cascade.map((line, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 py-2 transition-opacity duration-300 ${
                      line.status === "confirmed" ? "opacity-100" : "opacity-30"
                    }`}
                  >
                    <span className="mt-1.5 flex-shrink-0">
                      {line.status === "confirmed" ? (
                        <span className="block w-2 h-2 rounded-full bg-[var(--accent-green)]" />
                      ) : (
                        <span className="block w-2 h-2 rounded-full border border-[var(--border-strong)]" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wider text-[var(--text-subtle)] mb-0.5">{line.category}</div>
                      <div className="text-[var(--text)]">
                        {line.label}
                        <span className="text-[var(--text-subtle)] ml-2">[simulated]</span>
                      </div>
                      {line.detail && (
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">{line.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {decision === "signed" && cascadeComplete && (closing || closingLoading) && (
            <section className="mb-10">
              <div className="p-6 border-l-2 border-[var(--border-strong)] bg-[var(--surface)]">
                <p className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">
                  Closing
                </p>
                <p className="text-lg text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                  {closing}
                  {closingLoading && (
                    <span className="inline-block w-2 h-4 bg-[var(--text-muted)] ml-1 animate-pulse align-middle" />
                  )}
                </p>
              </div>
            </section>
          )}

          {decision === "overridden" && (
            <section className="mb-10 p-6 border-l-2 border-[var(--border-strong)] bg-[var(--surface)]">
              <p className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">
                Override recorded
              </p>
              <p className="text-base text-[var(--text)] mb-4">
                The recommendation was not executed. What's the concern?
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Optional — what would you do differently?"
                rows={3}
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)] resize-none font-[family-name:var(--font-sans)]"
              />
            </section>
          )}

          <footer className="mt-20 pt-10 border-t border-[var(--border)] text-sm text-[var(--text-muted)] font-[family-name:var(--font-sans)]">
            <p>
              Lowfire · A Floviken laboratory experiment ·{" "}
              <a href="https://floviken.se" className="hover:text-[var(--text)] underline-offset-4 hover:underline">floviken.se</a>
            </p>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Architectural prototype only. Not for clinical use.
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}

function StatusNode({ label, status }: { label: string; status: NodeStatus }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-shrink-0">
        {status === "complete" && (
          <span className="block w-2 h-2 rounded-full bg-[var(--accent-green)]" />
        )}
        {status === "active" && (
          <span className="block w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-pulse" />
        )}
        {status === "idle" && (
          <span className="block w-2 h-2 rounded-full border border-[var(--border-strong)]" />
        )}
      </span>
      <span
        className={
          status === "idle"
            ? "text-[var(--text-subtle)]"
            : status === "active"
            ? "text-[var(--text)]"
            : "text-[var(--text-muted)]"
        }
      >
        {label}
      </span>
    </div>
  );
}

function Arrow() {
  return <span className="text-[var(--border-strong)]">→</span>;
}