"use client";

import { useEffect, useState } from "react";
import type { Bundle } from "@/lib/algorithm";

type CascadeItem = {
  id: string;
  category: string;
  label: string;
  detail?: string;
};

type CascadeStatus = "pending" | "active" | "complete";

interface CascadeProps {
  bundle: Bundle;
  onComplete?: () => void;
}

// Flatten the bundle into a single ordered list of cascade items.
// Order matters: cultures first, antibiotics second, ancillary, nursing, pharmacy, reconciliation.
function flattenBundle(bundle: Bundle): CascadeItem[] {
  const items: CascadeItem[] = [];
  let i = 0;

  bundle.cultures.forEach((c) => {
    items.push({ id: `c-${i++}`, category: "CULTURE", label: c.label, detail: c.detail });
  });

  bundle.antibiotics.forEach((a) => {
    items.push({
      id: `a-${i++}`,
      category: "ORDER",
      label: `${a.agent}, ${a.route}, ${a.doseShape}`,
      detail: a.notes ? `${a.notes}${a.stat ? " · STAT" : ""}` : a.stat ? "STAT" : undefined,
    });
  });

  bundle.ancillary.forEach((c) => {
    items.push({ id: `x-${i++}`, category: "LABS", label: c.label, detail: c.detail });
  });

  bundle.nursing.forEach((c) => {
    items.push({ id: `n-${i++}`, category: "NURSING", label: c.label, detail: c.detail });
  });

  bundle.pharmacy.forEach((c) => {
    items.push({ id: `p-${i++}`, category: "PHARMACY", label: c.label, detail: c.detail });
  });

  bundle.reconciliation.forEach((c) => {
    items.push({ id: `r-${i++}`, category: "RECONCILE", label: c.label, detail: c.detail });
  });

  return items;
}

export function Cascade({ bundle, onComplete }: CascadeProps) {
  const items = flattenBundle(bundle);
  const [statuses, setStatuses] = useState<CascadeStatus[]>(() => items.map(() => "pending"));

  useEffect(() => {
    let cancelled = false;
    const cadence = 280; // ms between item activations

    const tick = (index: number) => {
      if (cancelled || index >= items.length) {
        if (!cancelled) onComplete?.();
        return;
      }
      // Mark current as active
      setStatuses((prev) => {
        const next = [...prev];
        next[index] = "active";
        return next;
      });
      // After a brief delay, mark complete and advance
      setTimeout(() => {
        if (cancelled) return;
        setStatuses((prev) => {
          const next = [...prev];
          next[index] = "complete";
          return next;
        });
        tick(index + 1);
      }, cadence);
    };

    // Small initial delay so the first item doesn't appear instantly
    const startTimer = setTimeout(() => tick(0), 200);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="font-mono text-xs leading-relaxed bg-neutral-950 border border-neutral-800 rounded p-5">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
        <span className="text-neutral-500 uppercase tracking-wider">Order cascade</span>
        <span className="text-neutral-600">[simulated]</span>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => {
          const status = statuses[idx];
          return (
            <div
              key={item.id}
              className={`flex gap-3 transition-opacity duration-300 ${
                status === "pending" ? "opacity-0" : "opacity-100"
              }`}
            >
              <span className="text-neutral-600 w-4 shrink-0">
                {status === "complete" ? "✓" : status === "active" ? "▸" : " "}
              </span>
              <span className="text-neutral-500 w-20 shrink-0">{item.category}</span>
              <span className="text-neutral-100 flex-1">
                {item.label}
                {item.detail && (
                  <span className="text-neutral-500"> — {item.detail}</span>
                )}
                <span className="text-neutral-700"> [simulated]</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}