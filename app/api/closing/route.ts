// app/api/closing/route.ts
//
// Generates the colleague's closing message after the cascade completes.
// Same voice as /api/speech, but shorter — just the wrap.

import Anthropic from "@anthropic-ai/sdk";
import type { Bundle } from "@/lib/algorithm";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are voicing the closing remark of a clinical second opinion. The on-call hospitalist has just signed the orders you recommended for empiric antibiotic coverage in neutropenic fever.

Speak as the colleague handing the patient back to them. 1-2 short sentences. First-person. Hospitalist register. Brief. State what you'd want them to watch for in the next 24-48 hours, and any reassessment trigger that matters.

Voice rules:
- All drug names appear as class-level placeholders (β-lactam-1, glycopeptide-1, fluoroquinolone-1, monobactam-1). Use these as if they were real drug names.
- No bullets, no headers, no lists.
- No safety disclaimers — the page handles those.
- Output only the spoken text. No preamble, no labels.`;

export async function POST(request: Request) {
  try {
    const { bundle } = (await request.json()) as { bundle: Bundle };

    if (!bundle || !bundle.triggered) {
      return new Response("No bundle provided.", { status: 400 });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const userMessage = `Orders just signed. Bundle:

Antibiotics:
${bundle.antibiotics.map((a) => `  - ${a.agent}, ${a.route}, ${a.doseShape}`).join("\n")}

Risk category: ${bundle.riskCategory}

Hand the patient back with what to watch for next.`;

    const stream = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      stream: true,
    });

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
