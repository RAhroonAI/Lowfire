import Anthropic from "@anthropic-ai/sdk";
import { Bundle } from "@/lib/algorithm";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are drafting an encounter note for a hospitalist's chart documentation in a neutropenic fever case. Use SOAP format.

OUTPUT STRUCTURE — produce exactly four sections, in this order, with these exact headers:

Subjective:
Objective:
Assessment:
Plan:

Each section has its own register. Follow these rules carefully.

SUBJECTIVE — 2-3 short sentences, narrative voice, what the clinician was told and observed at bedside. Make up plausible details consistent with a stable febrile neutropenic patient. Should always include something like "Called to bedside for fever" as the trigger. Reference patient's reported symptoms (or lack of them — neutropenic patients often present without localizing symptoms).

OBJECTIVE — bulleted facts. Each line starts with a hyphen. Include vitals (temp from bundle, blood pressure as plausible value, pulse, oxygen saturation), pertinent labs (ANC from bundle, plus made-up consistent CBC values like WBC, platelets), brief physical exam findings (no acute distress, lungs clear, heart regular, abdomen benign, no obvious source — typical neutropenic exam). Use plausible specific numbers. Concise.

ASSESSMENT — 1-2 sentences. Clinical formulation. Always opens with "Neutropenic fever" and identifies key risk factors from the bundle (recent chemotherapy implied, MDR colonization status, indwelling catheter, mucositis if present). End with risk stratification per the algorithm output ("high-risk per IDSA criteria" or similar).

PLAN — bulleted list of clinical actions. Each line starts with a hyphen. Pull directly from the bundle:
- Antibiotic regimen (use class-level redacted names — β-lactam-1, carbapenem-1, glycopeptide-1, etc. — never real drug names)
- Cultures drawn
- Monitoring orders
- Reassessment timing (24-48 hours typical)
- Source-tailoring note (mention de-escalation once cultures return)
- Any out-of-scope items the bundle flags (e.g. ID consult for complex resistance patterns)

Keep the entire note under 200 words total. Hospitalist register throughout — efficient, factual, no flourish. Never reference the AI second opinion or the alert system. Never include real drug names — only the redacted class names from the bundle. No markdown formatting except the section headers and hyphen bullets.`;

export async function POST(req: Request) {
  try {
    const { bundle } = (await req.json()) as { bundle: Bundle };

    if (!bundle || !bundle.triggered) {
      return new Response("Invalid bundle", { status: 400 });
    }

    const userPrompt = `Draft a SOAP-format encounter note for this case:

${JSON.stringify(bundle, null, 2)}

Write the note now using the four-section SOAP structure.`;

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Unknown error", { status: 500 });
  }
}