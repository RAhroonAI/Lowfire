"use client";

import { useState, useEffect, useRef } from "react";
import { runAlgorithm, redact, AllergySeverity, RenalFunction, Mucositis, Bundle } from "@/lib/algorithm";

type DecisionState = "pending" | "signed" | "overridden";

export default function Home() {
  // Trigger inputs
  const [anc, setAnc] = useState<string>("");
  const [temp, setTemp] = useState<string>("");
  const [sustained, setSustained] = useState<boolean>(false);

  // Modifiers
  const [hemodynamicallyStable, setHemodynamicallyStable] = useState<boolean>(true);
  const [penicillinAllergy, setPenicillinAllergy] = useState<AllergySeverity>("none");
  const [recentMDR, setRecentMDR] = useState<boolean>(false);
  const [renalFunction, setRenalFunction] = useState<RenalFunction>("normal");
  const [catheterPresent, setCatheterPresent] = useState<boolean>(false);
  const [mucositis, setMucositis] = useState<Mucositis>("none");

  // AI speech state
  const [speech, setSpeech] = useState<string>("");
  const [speechLoading, setSpeechLoading] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Decision state
  const [decision, setDecision] = useState<DecisionState>("pending");

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
          recentMDR,
          renalFunction,
          catheterPresent,
          mucositis,
        })
      )
    : null;

  const bundleKey = bundle ? JSON.stringify(bundle) : "";

  const lastBundleKey = useRef<string>("");

  useEffect(() => {
    if (!bundleKey || bundleKey === lastBundleKey.current) return;
    lastBundleKey.current = bundleKey;

    setSpeech("");
    setSpeechError(null);
    setDecision("pending");
    setSpeechLoading(true);

    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundle: JSON.parse(bundleKey) }),
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
    })();

    return () => controller.abort();
  }, [bundleKey]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-12 pt-8">
          <h1 className="text-4xl font-semibold mb-3">Lowfire</h1>
          <p className="text-lg text-neutral-300 mb-2">
            An experiment in whether an AI narrative layer can usefully sit on top of a deterministic clinical algorithm.
          </p>
          <p className="text-sm text-neutral-500">
            A Floviken laboratory experiment. Architectural prototype. Not for clinical use.
          </p>
        </header>

        <section className="mb-8 p-4 border border-neutral-800 rounded bg-neutral-900/50">
          <p className="text-xs text-neutral-400 leading-relaxed">
            Lowfire demonstrates an architectural pattern for AI second-opinion layers in EHRs.
            The recommendation is produced by a deterministic algorithm encoding the IDSA/ASCO neutropenic fever guideline.
            All drug names are redacted to class level. No real orders are placed, no real systems are notified.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wide text-neutral-400 mb-4">Inputs</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm text-neutral-300 mb-2">
                Absolute neutrophil count (ANC)
              </label>
              <div className="flex items-baseline gap-3">
                <input
                  type="number"
                  value={anc}
                  onChange={(e) => setAnc(e.target.value)}
                  placeholder="e.g. 200"
                  className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 w-40 text-neutral-100 focus:outline-none focus:border-neutral-500"
                />
                <span className="text-sm text-neutral-500">cells/mm³</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-neutral-300 mb-2">Temperature</label>
              <div className="flex items-baseline gap-3">
                <input
                  type="number"
                  step="0.1"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  placeholder="e.g. 38.5"
                  className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 w-40 text-neutral-100 focus:outline-none focus:border-neutral-500"
                />
                <span className="text-sm text-neutral-500">°C</span>
              </div>
              <label className="flex items-center gap-2 mt-3 text-sm text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sustained}
                  onChange={(e) => setSustained(e.target.checked)}
                  className="accent-neutral-400"
                />
                Sustained ≥ 38.0°C for at least one hour
              </label>
            </div>
          </div>
        </section>

        {criteriaMet && (
          <section className="mb-8 p-5 border-l-2 border-amber-500 bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-500 mb-1">Trigger</p>
            <p className="text-base text-neutral-100">
              Criteria met for empiric antibiotic coverage.
            </p>
            <p className="text-xs text-neutral-400 mt-2">
              ANC {ancNum} cells/mm³ &middot; Temperature {tempNum.toFixed(1)}°C
              {sustained && " (sustained)"}
            </p>
          </section>
        )}

        {criteriaMet && (
          <section className="mb-8">
            <h2 className="text-sm uppercase tracking-wide text-neutral-400 mb-4">Patient modifiers</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm text-neutral-300 mb-2">Hemodynamic status</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={hemodynamicallyStable} onChange={() => setHemodynamicallyStable(true)} className="accent-neutral-400" />
                    Stable
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!hemodynamicallyStable} onChange={() => setHemodynamicallyStable(false)} className="accent-neutral-400" />
                    Unstable
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-2">Penicillin allergy</label>
                <select
                  value={penicillinAllergy}
                  onChange={(e) => setPenicillinAllergy(e.target.value as AllergySeverity)}
                  className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-neutral-100 focus:outline-none focus:border-neutral-500"
                >
                  <option value="none">None</option>
                  <option value="mild">Mild (rash, GI)</option>
                  <option value="severe">Severe (anaphylaxis)</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input type="checkbox" checked={recentMDR} onChange={(e) => setRecentMDR(e.target.checked)} className="accent-neutral-400" />
                  Recent MDR colonization (MRSA / VRE / ESBL / KPC)
                </label>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-2">Renal function</label>
                <select
                  value={renalFunction}
                  onChange={(e) => setRenalFunction(e.target.value as RenalFunction)}
                  className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-neutral-100 focus:outline-none focus:border-neutral-500"
                >
                  <option value="normal">Normal</option>
                  <option value="impaired">Impaired</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input type="checkbox" checked={catheterPresent} onChange={(e) => setCatheterPresent(e.target.checked)} className="accent-neutral-400" />
                  Indwelling central catheter present
                </label>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-2">Mucositis</label>
                <select
                  value={mucositis}
                  onChange={(e) => setMucositis(e.target.value as Mucositis)}
                  className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-neutral-100 focus:outline-none focus:border-neutral-500"
                >
                  <option value="none">None</option>
                  <option value="mild">Mild</option>
                  <option value="severe">Severe</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {bundle && (
          <section className="mb-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm uppercase tracking-wide text-neutral-400">Second opinion</h2>
              <span className="text-xs text-neutral-600 font-mono">claude-sonnet-4-5</span>
            </div>

            <div className="p-5 border border-neutral-800 rounded bg-neutral-900/40 min-h-[120px]">
              {speechError && <p className="text-sm text-red-400">{speechError}</p>}
              {!speechError && (
                <p className="text-base text-neutral-100 leading-relaxed whitespace-pre-wrap">
                  {speech}
                  {speechLoading && (
                    <span className="inline-block w-2 h-4 bg-neutral-400 ml-1 animate-pulse align-middle" />
                  )}
                </p>
              )}
            </div>
          </section>
        )}

        {bundle && !speechLoading && !speechError && speech && decision === "pending" && (
          <section className="mb-8">
            <p className="text-xs text-neutral-500 mb-3">
              Demonstration only — no real orders will be placed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDecision("signed")}
                className="px-5 py-2.5 bg-neutral-100 text-neutral-900 rounded font-medium hover:bg-white transition-colors"
              >
                Sign
              </button>
              <button
                onClick={() => setDecision("overridden")}
                className="px-5 py-2.5 bg-transparent border border-neutral-700 text-neutral-300 rounded font-medium hover:border-neutral-500 hover:text-neutral-100 transition-colors"
              >
                Override
              </button>
            </div>
          </section>
        )}

        {decision === "signed" && (
          <section className="mb-8 p-5 border-l-2 border-emerald-600 bg-emerald-950/20">
            <p className="text-xs uppercase tracking-wide text-emerald-500 mb-1">Decision recorded</p>
            <p className="text-base text-neutral-100">Orders signed.</p>
            <p className="text-xs text-neutral-400 mt-2">
              [Cascade animation coming in next step — currently a placeholder.]
            </p>
          </section>
        )}
        {decision === "overridden" && (
          <section className="mb-8 p-5 border-l-2 border-neutral-600 bg-neutral-900/40">
            <p className="text-xs uppercase tracking-wide text-neutral-400 mb-1">Decision recorded</p>
            <p className="text-base text-neutral-100">Override recorded.</p>
          </section>
        )}

        <footer className="mt-16 pt-8 border-t border-neutral-800 text-xs text-neutral-500">
          <p>
            Lowfire &middot; A Floviken laboratory experiment &middot;{" "}
            <a href="https://floviken.se" className="hover:text-neutral-300">floviken.se</a>
          </p>
          <p className="mt-1">Architectural prototype only. Not for clinical use.</p>
        </footer>
      </div>
    </main>
  );
}