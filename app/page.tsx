"use client";

import { useState, useRef, useEffect } from "react";
import { runAlgorithm, redact, AllergySeverity, RenalFunction, Mucositis, Bundle } from "@/lib/algorithm";

type AlertResponse = "pending" | "engaged" | "dismissed";
type DecisionState = "pending" | "signed" | "overridden";
type NodeStatus = "idle" | "active" | "complete";

interface CascadeLine {
  label: string;
  detail?: string;
  category: string;
  status: "pending" | "confirmed";
}

interface IntakeLine {
  label: string;
  value: string;
  status: "pending" | "confirmed";
}

interface SoapSection {
  label: string;
  body: string;
}

export default function Home() {
  // Empty by default — user clicks "Open hypothetical case" to populate
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

  const [alertResponse, setAlertResponse] = useState<AlertResponse>("pending");

  const [intake, setIntake] = useState<IntakeLine[]>([]);
  const [intakeComplete, setIntakeComplete] = useState<boolean>(false);

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
  const [closingComplete, setClosingComplete] = useState<boolean>(false);

  const [noteRequested, setNoteRequested] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");
  const [noteLoading, setNoteLoading] = useState<boolean>(false);

  const [overrideReason, setOverrideReason] = useState<string>("");

  const speechAbortRef = useRef<AbortController | null>(null);
  const prevInputStatusRef = useRef<NodeStatus>("idle");
  const prevAlgorithmStatusRef = useRef<NodeStatus>("idle");
  const prevClaudeStatusRef = useRef<NodeStatus>("idle");
  const prevClinicianStatusRef = useRef<NodeStatus>("idle");

  const inputsSectionRef = useRef<HTMLElement>(null);
  const intakeSectionRef = useRef<HTMLElement>(null);
  const speechSectionRef = useRef<HTMLElement>(null);
  const ordersSectionRef = useRef<HTMLElement>(null);
  const closingSectionRef = useRef<HTMLElement>(null);
  const noteSectionRef = useRef<HTMLElement>(null);

  function scrollIntoViewSoft(el: HTMLElement | null) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const ancNum = parseFloat(anc);
  const tempNum = parseFloat(temp);
  const ancValid = !isNaN(ancNum) && ancNum >= 0;
  const tempValid = !isNaN(tempNum) && tempNum > 0;

  const ancCriteriaMet = ancValid && ancNum < 500;
  const tempThreshold = sustained ? 38.0 : 38.3;
  const tempCriteriaMet = tempValid && tempNum >= tempThreshold;
  const criteriaMet = ancCriteriaMet && tempCriteriaMet;

  const noCaseLoaded = anc === "" && temp === "";

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

  if (!criteriaMet && (alertResponse !== "pending" || speechRequested || decision !== "pending")) {
    if (speechAbortRef.current) speechAbortRef.current.abort();
    setAlertResponse("pending");
    setIntake([]);
    setIntakeComplete(false);
    setSpeech("");
    setSpeechError(null);
    setSpeechRequested(false);
    setBundleAtRequest(null);
    setDecision("pending");
    setCascade([]);
    setCascadeComplete(false);
    setClosing("");
    setClosingComplete(false);
    setNoteRequested(false);
    setNote("");
    setOverrideReason("");
  }

  function handleOpenHypotheticalCase() {
    setAnc("200");
    setTemp("38.5");
    setSustained(false);
    setHemodynamicallyStable(true);
    setPenicillinAllergy("none");
    setMrsa(false);
    setVre(false);
    setEsbl(true);
    setKpc(false);
    setRenalFunction("normal");
    setCatheterPresent(true);
    setMucositis("none");
    // Scroll the inputs section into view so the user sees the values populate
    setTimeout(() => scrollIntoViewSoft(inputsSectionRef.current), 100);
  }

  function buildIntakeLines(): IntakeLine[] {
    const mdrFlags: string[] = [];
    if (mrsa) mdrFlags.push("MRSA");
    if (vre) mdrFlags.push("VRE");
    if (esbl) mdrFlags.push("ESBL");
    if (kpc) mdrFlags.push("KPC");

    return [
      { label: "ANC", value: `${ancNum} cells/mm³ · trigger`, status: "pending" },
      { label: "Temperature", value: `${tempNum.toFixed(1)}°C · trigger`, status: "pending" },
      { label: "Hemodynamic status", value: hemodynamicallyStable ? "stable" : "unstable", status: "pending" },
      { label: "Penicillin allergy", value: penicillinAllergy === "none" ? "none" : penicillinAllergy, status: "pending" },
      { label: "MDR colonization", value: mdrFlags.length > 0 ? mdrFlags.join(", ") : "none", status: "pending" },
      { label: "Renal function", value: renalFunction, status: "pending" },
      { label: "Indwelling catheter", value: catheterPresent ? "present" : "absent", status: "pending" },
      { label: "Mucositis", value: mucositis, status: "pending" },
    ];
  }

  async function runIntakeCascade() {
    const lines = buildIntakeLines();
    setIntake(lines);
    setIntakeComplete(false);

    setTimeout(() => scrollIntoViewSoft(intakeSectionRef.current), 100);

    const lineDelay = 240;
    for (let i = 0; i < lines.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, lineDelay));
      setIntake((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "confirmed" };
        return next;
      });
    }

    setIntakeComplete(true);
  }

  useEffect(() => {
    if (alertResponse === "engaged" && intake.length === 0 && bundle) {
      void (async () => {
        await runIntakeCascade();
        await new Promise((resolve) => setTimeout(resolve, 400));
        await handleGetSecondOpinion();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertResponse]);

  useEffect(() => {
    if (speechRequested && intakeComplete) {
      setTimeout(() => scrollIntoViewSoft(speechSectionRef.current), 200);
    }
  }, [speechRequested, intakeComplete]);

  useEffect(() => {
    if (decision === "signed" && cascade.length > 0) {
      setTimeout(() => scrollIntoViewSoft(ordersSectionRef.current), 100);
    }
  }, [decision, cascade.length]);

  useEffect(() => {
    if (cascadeComplete && (closingLoading || closing)) {
      setTimeout(() => scrollIntoViewSoft(closingSectionRef.current), 200);
    }
  }, [cascadeComplete, closingLoading, closing]);

  useEffect(() => {
    if (noteRequested) {
      setTimeout(() => scrollIntoViewSoft(noteSectionRef.current), 100);
    }
  }, [noteRequested]);

  function handleEngageAlert() {
    setAlertResponse("engaged");
  }

  function handleDismissAlert() {
    setAlertResponse("dismissed");
    if (speechAbortRef.current) speechAbortRef.current.abort();
    setSpeech("");
    setSpeechRequested(false);
    setBundleAtRequest(null);
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
    setClosingComplete(false);
    setNoteRequested(false);
    setNote("");
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
      setClosingComplete(true);
    } catch {
      // silent
    } finally {
      setClosingLoading(false);
    }
  }

  function handleOverride() {
    setDecision("overridden");
  }

  async function handleCreateNote() {
    if (!bundleAtRequest) return;
    setNoteRequested(true);
    setNote("");
    setNoteLoading(true);

    try {
      const response = await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle: bundleAtRequest }),
      });

      if (!response.ok || !response.body) {
        setNoteLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setNote((prev) => prev + chunk);
      }
    } catch {
      // silent
    } finally {
      setNoteLoading(false);
    }
  }

  const bundleChangedSinceRequest =
    speechRequested &&
    bundleAtRequest &&
    bundle &&
    JSON.stringify(bundle) !== JSON.stringify(bundleAtRequest);

  const inputStatus: NodeStatus = criteriaMet ? "complete" : ancValid || tempValid ? "active" : "idle";
  const algorithmStatus: NodeStatus = criteriaMet
    ? alertResponse === "engaged" || alertResponse === "dismissed"
      ? "complete"
      : "active"
    : "idle";
  const claudeStatus: NodeStatus =
    alertResponse === "dismissed"
      ? "idle"
      : speechLoading || noteLoading
      ? "active"
      : speech && !speechError
      ? "complete"
      : "idle";
  const clinicianStatus: NodeStatus =
    alertResponse === "dismissed" || decision !== "pending"
      ? "complete"
      : speech && !speechLoading
      ? "active"
      : "idle";

  const inputJustComplete = inputStatus === "complete" && prevInputStatusRef.current !== "complete";
  const algorithmJustComplete = algorithmStatus === "complete" && prevAlgorithmStatusRef.current !== "complete";
  const claudeJustComplete = claudeStatus === "complete" && prevClaudeStatusRef.current !== "complete";
  const clinicianJustComplete = clinicianStatus === "complete" && prevClinicianStatusRef.current !== "complete";

  useEffect(() => {
    prevInputStatusRef.current = inputStatus;
    prevAlgorithmStatusRef.current = algorithmStatus;
    prevClaudeStatusRef.current = claudeStatus;
    prevClinicianStatusRef.current = clinicianStatus;
  });

  return (
    <main className="min-h-screen">
      <div className="border-b border-[var(--border)] bg-[var(--background)]/95 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-8 py-4 overflow-x-auto">
          <div className="flex items-center gap-4 text-sm font-[family-name:var(--font-mono)] whitespace-nowrap min-w-max">
            <StatusNode label="input" status={inputStatus} justComplete={inputJustComplete} />
            <Arrow />
            <StatusNode label="algorithm" status={algorithmStatus} justComplete={algorithmJustComplete} />
            <Arrow />
            <StatusNode label="claude-sonnet-4-5" status={claudeStatus} justComplete={claudeJustComplete} />
            <Arrow />
            <StatusNode label="clinician" status={clinicianStatus} justComplete={clinicianJustComplete} />
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

          <section className="mb-12">
            <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--text-muted)] mb-4">
              Why this matters
            </p>
            <p className="text-lg leading-relaxed text-[var(--text)] mb-4">
              Chemotherapy works by killing cells that divide quickly. That includes cancer cells, but also
              neutrophils — the white blood cells responsible for mounting the body&apos;s inflammatory response
              to infection. When the neutrophil count drops below a threshold, the patient enters a window
              where their immune system can&apos;t generate the normal signals of infection.
            </p>
            <p className="text-lg leading-relaxed text-[var(--text)]">
              The urine looks clean even when there&apos;s a urinary infection. The chest X-ray looks normal even
              when there&apos;s pneumonia. Vital signs may hold even as bacteremia progresses. Fever is often the
              only signal left. That&apos;s why a low ANC plus a fever is treated as an emergency on its own —
              and why the empiric antibiotic window is measured in minutes, not hours.
            </p>
          </section>

          <section className="mb-12 px-5 py-4 border border-[var(--border)] bg-[var(--surface)] rounded">
            <p className="text-sm leading-relaxed text-[var(--text-muted)] font-[family-name:var(--font-sans)]">
              All drug names redacted to class level. No real orders placed. No clinical use.
              The deterministic algorithm encodes IDSA / ASCO neutropenic fever guidelines.
            </p>
          </section>

          {/* ---- OPEN HYPOTHETICAL CASE BUTTON ---- */}
          {noCaseLoaded && (
            <section className="mb-10 section-reveal">
              <button
                onClick={handleOpenHypotheticalCase}
                className="font-[family-name:var(--font-sans)] px-6 py-3 bg-[var(--text)] text-[var(--background)] rounded text-sm font-medium hover:bg-black transition-colors"
              >
                Open hypothetical case →
              </button>
              <p className="text-xs text-[var(--text-subtle)] mt-3 font-[family-name:var(--font-sans)]">
                Loads a worked example. You can adjust any value to see how the algorithm responds.
              </p>
            </section>
          )}

          <section ref={inputsSectionRef} className="mb-10 scroll-mt-24">
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
            <section
              key={`trigger-${criteriaMet}`}
              className="mb-6 p-5 border-l-2 border-[var(--accent-amber)] bg-[var(--accent-amber-bg)] section-reveal trigger-glow scroll-mt-24"
            >
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
            </section>
          )}

          {criteriaMet && alertResponse === "pending" && (
            <section className="mb-12 section-reveal">
              <p className="text-sm text-[var(--text-muted)] mb-4 font-[family-name:var(--font-sans)]">
                The deterministic algorithm has produced a recommendation. Claude has drafted an opinion on the case in the voice of a hospitalist colleague.
              </p>
              <div className="flex flex-wrap gap-3 font-[family-name:var(--font-sans)]">
                <button
                  onClick={handleEngageAlert}
                  className="px-6 py-3 bg-[var(--text)] text-[var(--background)] rounded text-sm font-medium hover:bg-black transition-colors"
                >
                  Read AI opinion →
                </button>
                <button
                  onClick={handleDismissAlert}
                  className="px-6 py-3 bg-transparent border border-[var(--border-strong)] text-[var(--text)] rounded text-sm font-medium hover:border-[var(--text-muted)] transition-colors"
                >
                  Dismiss alert
                </button>
              </div>
            </section>
          )}

          {alertResponse === "dismissed" && (
            <section className="mb-12 p-5 border border-[var(--border)] bg-[var(--surface)] rounded section-reveal">
              <p className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">
                Alert dismissed
              </p>
              <p className="text-base text-[var(--text)] leading-relaxed">
                The clinician proceeds independently. Lowfire&apos;s second-opinion layer is offered, not imposed —
                the AI is one path among several. To re-engage the alert and read the second opinion, refresh
                the page.
              </p>
            </section>
          )}

          {alertResponse === "engaged" && criteriaMet && (
            <>
              {intake.length > 0 && (
                <section ref={intakeSectionRef} className="mb-10 section-reveal scroll-mt-24">
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Algorithm intake
                    </h2>
                    <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-subtle)]">
                      deterministic engine
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mb-5 font-[family-name:var(--font-sans)] italic">
                    What the algorithm received and decided.
                  </p>

                  <div className="p-5 border border-[var(--border-strong)] bg-[var(--surface-cascade)] rounded font-[family-name:var(--font-mono)] text-sm">
                    {intake.map((line, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 py-1.5 cascade-line ${
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
                        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3">
                          <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider min-w-[160px]">
                            {line.label}
                          </span>
                          <span className="text-[var(--text)]">{line.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {speechRequested && intakeComplete && (
                <section ref={speechSectionRef} className="mb-10 section-reveal scroll-mt-24">
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      AI opinion
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
                          <span className="inline-block w-2 h-4 bg-[var(--text-muted)] ml-1 streaming-cursor align-middle" />
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
                <section className="mb-10 section-reveal">
                  <p className="text-xs text-[var(--text-subtle)] mb-3 font-[family-name:var(--font-sans)]">
                    Demonstration only — no real orders will be placed.
                  </p>
                  <div className="flex gap-3 font-[family-name:var(--font-sans)]">
                    <button
                      onClick={handleSign}
                      className="px-6 py-2.5 bg-[var(--text)] text-[var(--background)] rounded text-sm font-medium hover:bg-black transition-colors"
                    >
                      Sign and initiate orders?
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
                <section ref={ordersSectionRef} className="mb-10 section-reveal scroll-mt-24">
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
                        className={`flex items-start gap-3 py-2 cascade-line ${
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
                <section ref={closingSectionRef} className="mb-10 section-reveal scroll-mt-24">
                  <div className="p-6 border-l-2 border-[var(--border-strong)] bg-[var(--surface)]">
                    <p className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">
                      Closing
                    </p>
                    <p className="text-lg text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                      {closing}
                      {closingLoading && (
                        <span className="inline-block w-2 h-4 bg-[var(--text-muted)] ml-1 streaming-cursor align-middle" />
                      )}
                    </p>
                  </div>
                </section>
              )}

              {decision === "signed" && closingComplete && !noteRequested && (
                <section className="mb-10 section-reveal">
                  <button
                    onClick={handleCreateNote}
                    className="font-[family-name:var(--font-sans)] px-6 py-3 bg-[var(--text)] text-[var(--background)] rounded text-sm font-medium hover:bg-black transition-colors"
                  >
                    Create note →
                  </button>
                  <p className="text-xs text-[var(--text-subtle)] mt-3 font-[family-name:var(--font-sans)]">
                    Drafts an encounter note from the structured bundle.
                  </p>
                </section>
              )}

              {noteRequested && (
                <section ref={noteSectionRef} className="mb-10 section-reveal scroll-mt-24">
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Encounter note
                    </h2>
                    <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-subtle)]">
                      claude-sonnet-4-5 · draft
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mb-5 font-[family-name:var(--font-sans)] italic">
                    Demonstration as if the clinician had visited the patient bedside.
                  </p>

                  <div className="p-6 border border-[var(--border)] bg-[var(--surface)] rounded min-h-[140px] font-[family-name:var(--font-sans)] text-sm text-[var(--text)] leading-relaxed">
                    <SoapNote text={note} loading={noteLoading} />
                  </div>
                  {!noteLoading && note && (
                    <p className="text-xs text-[var(--text-subtle)] mt-3 font-[family-name:var(--font-sans)] italic">
                      Draft only. Not signed, not entered into any chart.
                    </p>
                  )}
                </section>
              )}

              {decision === "overridden" && (
                <section className="mb-10 p-6 border-l-2 border-[var(--border-strong)] bg-[var(--surface)] section-reveal">
                  <p className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">
                    Override recorded
                  </p>
                  <p className="text-base text-[var(--text)] mb-4">
                    The recommendation was not executed. What&apos;s the concern?
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
            </>
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

function StatusNode({
  label,
  status,
  justComplete,
}: {
  label: string;
  status: NodeStatus;
  justComplete: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-shrink-0">
        {status === "complete" && (
          <span
            key={justComplete ? "pulse" : "static"}
            className={`block w-2 h-2 rounded-full bg-[var(--accent-green)] dot-base ${justComplete ? "dot-complete" : ""}`}
          />
        )}
        {status === "active" && (
          <span className="block w-2 h-2 rounded-full bg-[var(--accent-amber)] streaming-cursor dot-base" />
        )}
        {status === "idle" && (
          <span className="block w-2 h-2 rounded-full border border-[var(--border-strong)] dot-base" />
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

function SoapNote({ text, loading }: { text: string; loading: boolean }) {
  const sections = parseSoapSections(text);

  if (sections.length === 0) {
    return (
      <div className="whitespace-pre-wrap">
        {text}
        {loading && (
          <span className="inline-block w-2 h-4 bg-[var(--text-muted)] ml-1 streaming-cursor align-middle" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {sections.map((section, i) => (
        <div key={i}>
          <p className="font-[family-name:var(--font-sans)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">
            {section.label}
          </p>
          <div className="whitespace-pre-wrap text-[var(--text)]">{section.body}</div>
        </div>
      ))}
      {loading && (
        <span className="inline-block w-2 h-4 bg-[var(--text-muted)] ml-1 streaming-cursor align-middle" />
      )}
    </div>
  );
}

function parseSoapSections(text: string): SoapSection[] {
  if (!text.trim()) return [];
  const headers = ["Subjective:", "Objective:", "Assessment:", "Plan:"];
  const sections: SoapSection[] = [];
  let remaining = text;

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const idx = remaining.indexOf(header);
    if (idx === -1) continue;
    const after = remaining.slice(idx + header.length);
    const nextHeader = headers.slice(i + 1).find((h) => after.includes(h));
    const endIdx = nextHeader ? after.indexOf(nextHeader) : after.length;
    const body = after.slice(0, endIdx).trim();
    sections.push({ label: header.replace(":", ""), body });
    remaining = after.slice(endIdx);
  }

  return sections;
}