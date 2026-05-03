// app/api/speech/route.ts
//
// API route that takes a redacted bundle from the deterministic algorithm
// and asks Claude to voice it as a hospitalist colleague making the case
// for the recommendation. Streams the response back to the client.
//
// Phase 4a: workable first-draft system prompt. The voice will be tuned
// further in Phase 4b once we can iterate on real outputs.

import Anthropic from "@anthropic-ai/sdk";
import type { Bundle } from "@/lib/algorithm";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are voicing a clinical second opinion for an on-call hospitalist who has just been alerted that a patient meets criteria for empiric antibiotic coverage in neutropenic fever.

A deterministic algorithm has already produced a structured bundle of orders based on the IDSA/ASCO neutropenic fever guideline. Your job is NOT to make the recommendation — the algorithm has already made it. Your job is to VOICE the recommendation, the way a senior colleague would on rounds or over the phone, in 4-7 short sentences.

Voice guidelines:
- First person. "I'd start...", "I'd add...", "I'd cover with..."
- Hospitalist-on-the-phone register. Tight, declarative, ordered. No hedging.
- Speak in clinical priorities: cultures first, then empiric coverage, then add-ons, then ancillary.
- Reference the modifiers that fired the algorithm's branches. Why this drug class, why this add-on.
- Close with a brief acknowledgment of what's outside the algorithm's scope (local antibiogram, MDR specifics, etc.) — the way a colleague would say "but you'd want to factor in..."
- All drug names appear as class-level placeholders (β-lactam-1, glycopeptide-1, fluoroquinolone-1, monobactam-1). Use them as if they were real drug names. Do not reference real antibiotics.
- No bullet points, no headers, no lists. Continuous prose only.
- Do NOT include disclaimers, safety language, or "consult your clinician" caveats. The page handles all that. You are the colleague speaking; just speak.

Output only the spoken text. No preamble, no labels.`;

export async function POST(request: Request) {
  try {
    const { bundle } = (await request.json()) as { bundle: Bundle };

    if (!bundle || !bundle.triggered) {
      return new Response("No bundle provided or trigger not met.", { status: 400 });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const userMessage = `The algorithm has produced the following bundle. Voice the recommendation.

Risk category: ${bundle.riskCategory}

Antibiotics:
${bundle.antibiotics.map((a) => `  - ${a.agent}, ${a.route}, ${a.doseShape}${a.notes ? ` (${a.notes})` : ""}`).join("\n")}

Cultures:
${bundle.cultures.map((c) => `  - ${c.label}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}

Ancillary orders:
${bundle.ancillary.map((c) => `  - ${c.label}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}

Nursing:
${bundle.nursing.map((c) => `  - ${c.label}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}

Pharmacy:
${bundle.pharmacy.map((c) => `  - ${c.label}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}

Algorithm decisions (the reasoning trail):
${bundle.decisions.map((d) => `  - ${d}`).join("\n")}

Outside the algorithm's scope (mention briefly at the close):
${bundle.outOfScope.map((d) => `  - ${d}`).join("\n")}`;

    const stream = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      stream: true,
    });

    // Convert the Anthropic stream into a plain text stream the browser can read.
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Error: ${message}`, { status: 500 });
  }
}