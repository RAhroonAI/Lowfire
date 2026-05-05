// lib/algorithm.ts
//
// Deterministic encoding of the IDSA 2010 / ASCO-IDSA 2018 neutropenic fever
// empiric antibiotic guideline. This is the clinical core of Lowfire.
//
// IMPORTANT: This file contains real drug names and real (illustrative) doses.
// The public page never renders this output directly. The `redact` function
// below produces a class-level version of the bundle for display.
//
// Source guidelines:
//   - IDSA 2010: https://academic.oup.com/cid/article/52/4/e56/382256
//   - ASCO-IDSA 2018: https://ascopubs.org/doi/10.1200/JCO.2017.77.6211
//
// MDR organism logic (encoded per organism, not as a single "MDR" toggle):
//   - MRSA → add vancomycin (glycopeptide)
//   - VRE  → add linezolid (oxazolidinone) — covers VRE, also covers MRSA
//   - ESBL → escalate from cefepime to meropenem (carbapenem)
//   - KPC  → use ceftazidime-avibactam (β-lactam-inhibitor); meropenem
//            alone does NOT cover KPC because KPC is carbapenemase
//
// Lowfire is an architectural prototype. Not for clinical use.

export type AllergySeverity = "none" | "mild" | "severe";
export type RenalFunction = "normal" | "impaired";
export type Mucositis = "none" | "mild" | "severe";

export interface AlgorithmInput {
  anc: number;
  temp: number;
  sustained: boolean;
  hemodynamicallyStable: boolean;
  penicillinAllergy: AllergySeverity;
  mrsa: boolean;
  vre: boolean;
  esbl: boolean;
  kpc: boolean;
  renalFunction: RenalFunction;
  catheterPresent: boolean;
  mucositis: Mucositis;
}

export interface OrderItem {
  agent: string;
  agentClass: string;
  route: string;
  doseShape: string;
  notes?: string;
  stat?: boolean;
}

export interface BundleAction {
  label: string;
  detail?: string;
}

export interface Bundle {
  triggered: boolean;
  riskCategory: "high" | "low" | null;
  antibiotics: OrderItem[];
  cultures: BundleAction[];
  ancillary: BundleAction[];
  nursing: BundleAction[];
  pharmacy: BundleAction[];
  reconciliation: BundleAction[];
  decisions: string[];
  outOfScope: string[];
}

// ---------------------------------------------------------------------------
// runAlgorithm
// ---------------------------------------------------------------------------

export function runAlgorithm(input: AlgorithmInput): Bundle {
  const decisions: string[] = [];
  const outOfScope: string[] = [];

  // Trigger evaluation
  const tempThreshold = input.sustained ? 38.0 : 38.3;
  const ancCriteriaMet = input.anc < 500;
  const tempCriteriaMet = input.temp >= tempThreshold;
  const triggered = ancCriteriaMet && tempCriteriaMet;

  if (!triggered) {
    return {
      triggered: false,
      riskCategory: null,
      antibiotics: [],
      cultures: [],
      ancillary: [],
      nursing: [],
      pharmacy: [],
      reconciliation: [],
      decisions: ["Trigger criteria not met — no empiric coverage indicated."],
      outOfScope: [],
    };
  }

  decisions.push(
    `Trigger met: ANC ${input.anc} cells/mm³ (<500) and temperature ${input.temp.toFixed(1)}°C ` +
    `(${input.sustained ? "sustained ≥38.0°C" : "single ≥38.3°C"}).`
  );

  const riskCategory: "high" = "high";
  if (input.hemodynamicallyStable) {
    decisions.push(
      "Risk stratification: high-risk inpatient IV pathway (v1 default for the simplified algorithm)."
    );
  } else {
    decisions.push(
      "Hemodynamically unstable — high-risk inpatient pathway with broadened coverage."
    );
  }

  const antibiotics: OrderItem[] = [];

  // ---- Gram-negative β-lactam selection ------------------------------------
  // Default: cefepime (antipseudomonal β-lactam monotherapy)
  // Modifiers: severe penicillin allergy → fluoroquinolone + monobactam
  //            ESBL history → escalate to meropenem
  //            KPC history → ceftazidime-avibactam (carbapenem alone fails)

  if (input.penicillinAllergy === "severe") {
    // Severe (anaphylactic) penicillin allergy — avoid β-lactams entirely
    antibiotics.push({
      agent: "Ciprofloxacin",
      agentClass: "fluoroquinolone-1",
      route: "IV",
      doseShape: "X mg every Y hours",
      notes: "selected due to severe penicillin allergy",
      stat: true,
    });
    antibiotics.push({
      agent: "Aztreonam",
      agentClass: "monobactam-1",
      route: "IV",
      doseShape: "X g every Y hours",
      notes: "added for gram-negative coverage in severe β-lactam allergy",
      stat: true,
    });
    decisions.push(
      "Severe penicillin allergy — substituted fluoroquinolone + monobactam regimen for β-lactam monotherapy."
    );
    if (input.esbl || input.kpc) {
      outOfScope.push(
        "Severe β-lactam allergy combined with ESBL or KPC history is a complex case; ID consultation is warranted."
      );
      decisions.push(
        "Severe allergy combined with ESBL/KPC: this regimen may not adequately cover the resistance pattern. Flagged for ID consult."
      );
    }
  } else if (input.kpc) {
    // KPC takes precedence over ESBL (KPC strains are typically also ESBL)
    antibiotics.push({
      agent: "Ceftazidime-avibactam",
      agentClass: "β-lactam-inhibitor-1",
      route: "IV",
      doseShape: "X g every Y hours",
      notes: input.renalFunction === "impaired" ? "renal-adjusted; selected for KPC coverage" : "selected for KPC coverage",
      stat: true,
    });
    decisions.push(
      "Recent KPC colonization — selected β-lactam-inhibitor combination. Standard carbapenems do not cover KPC because KPC is a carbapenemase."
    );
    if (input.penicillinAllergy === "mild") {
      decisions.push(
        "Mild penicillin allergy noted — β-lactam-inhibitor combination acceptable (low cross-reactivity)."
      );
    }
  } else if (input.esbl) {
    // ESBL → escalate from cefepime to a carbapenem
    antibiotics.push({
      agent: "Meropenem",
      agentClass: "carbapenem-1",
      route: "IV",
      doseShape: "X g every Y hours",
      notes: input.renalFunction === "impaired" ? "renal-adjusted; selected for ESBL coverage" : "selected for ESBL coverage",
      stat: true,
    });
    decisions.push(
      "Recent ESBL colonization — escalated from cefepime to a carbapenem for reliable empiric coverage."
    );
    if (input.penicillinAllergy === "mild") {
      decisions.push(
        "Mild penicillin allergy noted — carbapenem acceptable (low cross-reactivity)."
      );
    }
  } else {
    // Standard pathway: cefepime
    antibiotics.push({
      agent: "Cefepime",
      agentClass: "β-lactam-1",
      route: "IV",
      doseShape: "X g every Y hours",
      notes: input.renalFunction === "impaired" ? "renal-adjusted" : undefined,
      stat: true,
    });
    if (input.penicillinAllergy === "mild") {
      decisions.push(
        "Mild penicillin allergy noted — cefepime acceptable (low cross-reactivity with penicillin)."
      );
    } else {
      decisions.push(
        "Empiric antipseudomonal β-lactam monotherapy with cefepime."
      );
    }
  }

  // ---- Gram-positive add-on logic ------------------------------------------
  // VRE history → linezolid (covers VRE AND MRSA, so vancomycin not added)
  // MRSA history (no VRE) → vancomycin
  // Otherwise: vancomycin add-on triggered by catheter / severe mucositis /
  //            hemodynamic instability

  const grampositiveReasons: string[] = [];
  if (input.catheterPresent) grampositiveReasons.push("indwelling catheter");
  if (input.mucositis === "severe") grampositiveReasons.push("severe mucositis");
  if (!input.hemodynamicallyStable) grampositiveReasons.push("hemodynamic instability");

  if (input.vre) {
    // VRE → linezolid (vancomycin won't work; linezolid also covers MRSA)
    antibiotics.push({
      agent: "Linezolid",
      agentClass: "oxazolidinone-1",
      route: "IV",
      doseShape: "X mg every Y hours",
      notes: "selected for VRE coverage; also covers MRSA if present",
      stat: true,
    });
    const vreReasons = ["recent VRE colonization"];
    if (input.mrsa) vreReasons.push("recent MRSA colonization (covered by same agent)");
    decisions.push(
      `Recent VRE colonization — selected oxazolidinone instead of glycopeptide. Vancomycin does not cover VRE by definition.`
    );
    if (grampositiveReasons.length > 0) {
      decisions.push(
        `Additional gram-positive risk factors present (${grampositiveReasons.join(", ")}) — covered by oxazolidinone selection.`
      );
    }
  } else if (input.mrsa) {
    // MRSA without VRE → vancomycin
    antibiotics.push({
      agent: "Vancomycin",
      agentClass: "glycopeptide-1",
      route: "IV",
      doseShape: "X mg/kg loading dose, then trough-guided",
      notes: "selected for MRSA coverage",
      stat: true,
    });
    const mrsaReasons = ["recent MRSA colonization"];
    if (grampositiveReasons.length > 0) mrsaReasons.push(...grampositiveReasons);
    decisions.push(
      `Recent MRSA colonization — added glycopeptide for gram-positive coverage. ${grampositiveReasons.length > 0 ? `Additional indications: ${grampositiveReasons.join(", ")}.` : ""}`
    );
  } else if (grampositiveReasons.length > 0) {
    // No specific MDR history but other gram-positive triggers → vancomycin
    antibiotics.push({
      agent: "Vancomycin",
      agentClass: "glycopeptide-1",
      route: "IV",
      doseShape: "X mg/kg loading dose, then trough-guided",
      notes: "add-on for gram-positive coverage",
      stat: true,
    });
    decisions.push(
      `Glycopeptide added for empiric gram-positive coverage due to: ${grampositiveReasons.join(", ")}.`
    );
  }

  // ---- Renal impairment ----------------------------------------------------

  if (input.renalFunction === "impaired") {
    decisions.push(
      "Renal impairment noted — dose adjustment required (agent selection unchanged)."
    );
  }

  // ---- Cultures ------------------------------------------------------------

  const cultures: BundleAction[] = [];
  if (input.catheterPresent) {
    cultures.push({
      label: "Blood cultures × 2",
      detail: "one peripheral, one from each lumen of indwelling line",
    });
    decisions.push(
      "Catheter present — paired blood cultures (line and peripheral) to evaluate for line infection."
    );
  } else {
    cultures.push({
      label: "Blood cultures × 2",
      detail: "two separate peripheral sites",
    });
  }
  cultures.push({ label: "Urinalysis with culture" });
  if (input.mucositis !== "none") {
    cultures.push({
      label: "Throat / oral swab",
      detail: "given mucositis",
    });
  }

  // ---- Ancillary orders ----------------------------------------------------

  const ancillary: BundleAction[] = [
    { label: "CBC with differential", detail: "repeat in 6 hours" },
    { label: "Comprehensive metabolic panel" },
    { label: "Lactate" },
  ];
  if (!input.hemodynamicallyStable) {
    ancillary.push({
      label: "Arterial blood gas",
      detail: "given hemodynamic instability",
    });
  }

  // ---- Nursing actions -----------------------------------------------------

  const nursing: BundleAction[] = [];
  if (!input.hemodynamicallyStable) {
    nursing.push({
      label: "Vital signs every 15 minutes × 4 hours, then reassess",
    });
  } else {
    nursing.push({
      label: "Vital signs every 1 hour × 4 hours, then every 4 hours",
    });
  }
  nursing.push({
    label: "Reverse isolation precautions",
    detail: "neutropenic patient",
  });

  // ---- Pharmacy actions ----------------------------------------------------

  const pharmacy: BundleAction[] = [
    { label: "Verify renal dosing on empiric antibiotics" },
  ];
  const mdrFlags: string[] = [];
  if (input.mrsa) mdrFlags.push("MRSA");
  if (input.vre) mdrFlags.push("VRE");
  if (input.esbl) mdrFlags.push("ESBL");
  if (input.kpc) mdrFlags.push("KPC");
  if (mdrFlags.length > 0) {
    pharmacy.push({
      label: "Cross-check empiric coverage against patient's MDR history",
      detail: `Documented colonization: ${mdrFlags.join(", ")}`,
    });
  }

  // ---- Reconciliation ------------------------------------------------------

  const reconciliation: BundleAction[] = [];
  reconciliation.push({
    label: "Discontinue any prior empiric β-lactam",
    detail: "to avoid duplicate therapy",
  });

  // ---- Out-of-scope flags --------------------------------------------------

  outOfScope.push(
    "Local antibiogram and unit-specific resistance patterns are not in the algorithm; consider when finalizing coverage."
  );
  outOfScope.push(
    "Pediatric dosing is not covered by this algorithm (adults only)."
  );
  outOfScope.push(
    "MASCC scoring and full risk-stratification beyond hemodynamic stability are not implemented in v1."
  );
  if ((input.kpc || input.esbl) && input.mrsa) {
    outOfScope.push(
      "Combined gram-negative and gram-positive resistance patterns may warrant ID consultation for source-specific tailoring."
    );
  }

  return {
    triggered: true,
    riskCategory,
    antibiotics,
    cultures,
    ancillary,
    nursing,
    pharmacy,
    reconciliation,
    decisions,
    outOfScope,
  };
}

// ---------------------------------------------------------------------------
// redact
// ---------------------------------------------------------------------------

export function redact(bundle: Bundle): Bundle {
  return {
    ...bundle,
    antibiotics: bundle.antibiotics.map((order) => ({
      ...order,
      agent: order.agentClass,
    })),
    decisions: bundle.decisions.map(redactString),
    reconciliation: bundle.reconciliation.map((action) => ({
      ...action,
      label: redactString(action.label),
      detail: action.detail ? redactString(action.detail) : undefined,
    })),
  };
}

function redactString(s: string): string {
  return s
    .replace(/\bCefepime\b/g, "β-lactam-1")
    .replace(/\bcefepime\b/g, "β-lactam-1")
    .replace(/\bMeropenem\b/g, "carbapenem-1")
    .replace(/\bmeropenem\b/g, "carbapenem-1")
    .replace(/\bCarbapenems?\b/g, "carbapenem-1")
    .replace(/\bcarbapenems?\b/g, "carbapenem-1")
    .replace(/\bCeftazidime-avibactam\b/g, "β-lactam-inhibitor-1")
    .replace(/\bceftazidime-avibactam\b/g, "β-lactam-inhibitor-1")
    .replace(/\bCiprofloxacin\b/g, "fluoroquinolone-1")
    .replace(/\bciprofloxacin\b/g, "fluoroquinolone-1")
    .replace(/\bAztreonam\b/g, "monobactam-1")
    .replace(/\baztreonam\b/g, "monobactam-1")
    .replace(/\bVancomycin\b/g, "glycopeptide-1")
    .replace(/\bvancomycin\b/g, "glycopeptide-1")
    .replace(/\bLinezolid\b/g, "oxazolidinone-1")
    .replace(/\blinezolid\b/g, "oxazolidinone-1")
    .replace(/β-lactam(?!-)/g, "β-lactam-1");
}