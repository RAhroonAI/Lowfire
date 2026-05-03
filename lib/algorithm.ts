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
// Lowfire is an architectural prototype. Not for clinical use.

export type AllergySeverity = "none" | "mild" | "severe";
export type RenalFunction = "normal" | "impaired";
export type Mucositis = "none" | "mild" | "severe";

export interface AlgorithmInput {
  anc: number;                    // cells/mm³
  temp: number;                   // °C
  sustained: boolean;             // sustained ≥38.0°C for ≥1h
  hemodynamicallyStable: boolean; // false = unstable
  penicillinAllergy: AllergySeverity;
  recentMDR: boolean;             // recent MDR colonization (MRSA/VRE/ESBL/KPC)
  renalFunction: RenalFunction;
  catheterPresent: boolean;
  mucositis: Mucositis;
}

export interface OrderItem {
  agent: string;       // real drug name (e.g. "Cefepime")
  agentClass: string;  // class-level label (e.g. "β-lactam-1")
  route: string;       // e.g. "IV"
  doseShape: string;   // e.g. "2g every 8 hours"
  notes?: string;      // e.g. "renal-adjusted"
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
  decisions: string[];        // reasoning trail for AI prompt
  outOfScope: string[];       // limits the algorithm doesn't cover
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

  // Risk stratification — v1 simplified to hemodynamic stability
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

  // ---- Antibiotic selection ------------------------------------------------

  const antibiotics: OrderItem[] = [];

  // Default: antipseudomonal β-lactam monotherapy with Cefepime
  // Penicillin allergy modifies this choice
  if (input.penicillinAllergy === "severe") {
    // Severe (anaphylactic) penicillin allergy — avoid β-lactams
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
  } else {
    // Standard or mild allergy — cefepime is acceptable (low cross-reactivity)
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

  // ---- Vancomycin add-on logic ---------------------------------------------

  const vancomycinReasons: string[] = [];
  if (input.catheterPresent) vancomycinReasons.push("indwelling catheter");
  if (input.mucositis === "severe") vancomycinReasons.push("severe mucositis");
  if (!input.hemodynamicallyStable) vancomycinReasons.push("hemodynamic instability");
  if (input.recentMDR) vancomycinReasons.push("recent MDR colonization");

  if (vancomycinReasons.length > 0) {
    antibiotics.push({
      agent: "Vancomycin",
      agentClass: "glycopeptide-1",
      route: "IV",
      doseShape: "X mg/kg loading dose, then trough-guided",
      notes: "add-on for gram-positive coverage",
      stat: true,
    });
    decisions.push(
      `Vancomycin added due to: ${vancomycinReasons.join(", ")}.`
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
  if (input.recentMDR) {
    pharmacy.push({
      label: "Cross-check empiric coverage against patient's MDR history",
    });
  }

  // ---- Reconciliation ------------------------------------------------------

  const reconciliation: BundleAction[] = [];
  // In a real EHR this would query the medication list. For the prototype,
  // we emit a generic reconciliation prompt.
  reconciliation.push({
    label: "Discontinue any prior empiric β-lactam",
    detail: "to avoid duplicate therapy",
  });

  // ---- Out-of-scope flags --------------------------------------------------

  outOfScope.push(
    "Local antibiogram and unit-specific resistance patterns are not in the algorithm; consider when finalizing coverage."
  );
  if (input.recentMDR) {
    outOfScope.push(
      "Specific MDR organism history may warrant tailored coverage beyond empiric defaults."
    );
  }
  outOfScope.push(
    "Pediatric dosing is not covered by this algorithm (adults only)."
  );
  outOfScope.push(
    "MASCC scoring and full risk-stratification beyond hemodynamic stability are not implemented in v1."
  );

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
// Returns a copy of the bundle with all real drug names replaced by their
// class-level labels. The display layer should only ever render the output
// of this function.

export function redact(bundle: Bundle): Bundle {
  return {
    ...bundle,
    antibiotics: bundle.antibiotics.map((order) => ({
      ...order,
      agent: order.agentClass, // overwrite real drug name with class label
    })),
    decisions: bundle.decisions.map(redactString),
    reconciliation: bundle.reconciliation.map((action) => ({
      ...action,
      label: redactString(action.label),
      detail: action.detail ? redactString(action.detail) : undefined,
    })),
  };
}

// Replace any real drug names in free-text strings with their class labels.
// Conservative: only the agents we use in the algorithm above.
function redactString(s: string): string {
  return s
    .replace(/\bCefepime\b/g, "β-lactam-1")
    .replace(/\bcefepime\b/g, "β-lactam-1")
    .replace(/\bCiprofloxacin\b/g, "fluoroquinolone-1")
    .replace(/\bciprofloxacin\b/g, "fluoroquinolone-1")
    .replace(/\bAztreonam\b/g, "monobactam-1")
    .replace(/\baztreonam\b/g, "monobactam-1")
    .replace(/\bVancomycin\b/g, "glycopeptide-1")
    .replace(/\bvancomycin\b/g, "glycopeptide-1")
    .replace(/β-lactam(?!-)/g, "β-lactam-1");
}