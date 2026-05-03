"use client";

import { useState } from "react";
import { runAlgorithm, redact, AllergySeverity, RenalFunction, Mucositis } from "@/lib/algorithm";

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

  const ancNum = parseFloat(anc);
  const tempNum = parseFloat(temp);
  const ancValid = !isNaN(ancNum) && ancNum >= 0;
  const tempValid = !isNaN(tempNum) && tempNum > 0;

  const ancCriteriaMet = ancValid && ancNum < 500;
  const tempThreshold = sustained ? 38.0 : 38.3;
  const tempCriteriaMet = tempValid && tempNum >= tempThreshold;
  const criteriaMet = ancCriteriaMet && tempCriteriaMet;

  // Run the algorithm only when criteria are met
  const bundle = criteriaMet
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

        {/* ---- INPUTS ---- */}
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
              <label className="block text-sm text-neutral-300 mb-2">
                Temperature
              </label>
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

        {/* ---- TRIGGER BANNER ---- */}
        {criteriaMet && (
          <section className="mb-8 p-5 border-l-2 border-amber-500 bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-500 mb-1">
              Trigger
            </p>
            <p className="text-base text-neutral-100">
              Criteria met for empiric antibiotic coverage.
            </p>
            <p className="text-xs text-neutral-400 mt-2">
              ANC {ancNum} cells/mm³ &middot; Temperature {tempNum.toFixed(1)}°C
              {sustained && " (sustained)"}
            </p>
          </section>
        )}

        {/* ---- MODIFIERS (only shown after trigger fires) ---- */}
        {criteriaMet && (
          <section className="mb-8">
            <h2 className="text-sm uppercase tracking-wide text-neutral-400 mb-4">Patient modifiers</h2>

            <div className="space-y-5">
              {/* Hemodynamic stability */}
              <div>
                <label className="block text-sm text-neutral-300 mb-2">Hemodynamic status</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={hemodynamicallyStable === true}
                      onChange={() => setHemodynamicallyStable(true)}
                      className="accent-neutral-400"
                    />
                    Stable
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={hemodynamicallyStable === false}
                      onChange={() => setHemodynamicallyStable(false)}
                      className="accent-neutral-400"
                    />
                    Unstable
                  </label>
                </div>
              </div>

              {/* Penicillin allergy */}
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

              {/* Recent MDR */}
              <div>
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recentMDR}
                    onChange={(e) => setRecentMDR(e.target.checked)}
                    className="accent-neutral-400"
                  />
                  Recent MDR colonization (MRSA / VRE / ESBL / KPC)
                </label>
              </div>

              {/* Renal function */}
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

              {/* Catheter */}
              <div>
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={catheterPresent}
                    onChange={(e) => setCatheterPresent(e.target.checked)}
                    className="accent-neutral-400"
                  />
                  Indwelling central catheter present
                </label>
              </div>

              {/* Mucositis */}
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

        {/* ---- DEBUG OUTPUT (temporary — removed in Phase 4) ---- */}
        {bundle && (
          <section className="mb-8">
            <h2 className="text-sm uppercase tracking-wide text-neutral-400 mb-4">
              Debug: redacted bundle output
            </h2>
            <p className="text-xs text-neutral-500 mb-3">
              Phase 3 scaffolding. The Phase 4 AI speech and cascade will replace this section.
            </p>
            <pre className="text-xs bg-neutral-900 border border-neutral-800 rounded p-4 overflow-x-auto text-neutral-300">
              {JSON.stringify(bundle, null, 2)}
            </pre>
          </section>
        )}

        <footer className="mt-16 pt-8 border-t border-neutral-800 text-xs text-neutral-500">
          <p>
            Lowfire &middot; A Floviken laboratory experiment &middot;{" "}
            <a href="https://floviken.se" className="hover:text-neutral-300">floviken.se</a>
          </p>
          <p className="mt-1">
            Architectural prototype only. Not for clinical use.
          </p>
        </footer>
      </div>
    </main>
  );
}