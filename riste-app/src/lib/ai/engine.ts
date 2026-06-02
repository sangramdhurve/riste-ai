/**
 * AI engine: one function, three providers.
 *   - ollama  : local, free, private (default)
 *   - gemini  : free cloud tier (don't use for private contacts)
 *   - groq    : free cloud tier, very fast
 *
 * Returns { text, escalate }. If the model decides a human is needed it
 * emits __ESCALATE__, which we turn into escalate=true so the worker holds
 * the message for the operator instead of sending it.
 */

export type AiResult = { text: string; escalate: boolean; confidence: number };

const ESCALATE_TOKEN = "__ESCALATE__";

export async function generate(system: string, user: string): Promise<AiResult> {
  const provider = process.env.AI_PROVIDER ?? "ollama";
  let raw = "";
  if (provider === "ollama") raw = await ollama(system, user);
  else if (provider === "gemini") raw = await gemini(system, user);
  else if (provider === "groq") raw = await groq(system, user);
  else throw new Error(`Unknown AI_PROVIDER: ${provider}`);

  const text = raw.trim();
  const escalate = text.includes(ESCALATE_TOKEN);
  // Naive confidence: short, clean, non-escalating replies score high.
  const confidence = escalate ? 0 : Math.min(1, Math.max(0.4, 1 - text.length / 600));
  return { text: text.replace(ESCALATE_TOKEN, "").trim(), escalate, confidence };
}

async function ollama(system: string, user: string): Promise<string> {
  const res = await fetch(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

async function groq(system: string, user: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function gemini(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
