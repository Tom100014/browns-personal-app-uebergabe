// Provider-agnostic LLM call. Supports OpenRouter (sk-or-), Anthropic (sk-ant-)
// and OpenAI-style keys. Configure via LLM_API_KEY + optional LLM_MODEL.
export type LLMResult = { text?: string; error?: string }

export async function askLLM(system: string, user: string, maxTokens = 900, modelOverride?: string): Promise<LLMResult> {
  const key = process.env.LLM_API_KEY
  if (!key) return { error: "not_configured" }
  const isOpenRouter = key.startsWith("sk-or-")
  const isAnthropic = key.startsWith("sk-ant-")
  
  const candidateModels = isOpenRouter
    ? [modelOverride || process.env.LLM_MODEL || "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "openai/gpt-4o-mini"]
    : [modelOverride || process.env.LLM_MODEL || (isAnthropic ? "claude-sonnet-4-6" : "gpt-4o-mini")]

  for (const model of candidateModels) {
    try {
      if (isAnthropic) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
        })
        const d = await res.json()
        if (!res.ok) return { error: d?.error?.message || "LLM-Fehler" }
        return { text: d?.content?.[0]?.text }
      }

      // OpenRouter / OpenAI — Chat Completions
      const base = isOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"
      const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "content-type": "application/json" }
      if (isOpenRouter) { headers["HTTP-Referer"] = "https://browns-perso.vercel.app"; headers["X-Title"] = "Browns Perso" }
      
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      })
      const d = await res.json()
      if (res.ok && d?.choices?.[0]?.message?.content) {
        return { text: d.choices[0].message.content }
      }
      // If candidate failed with credit/rate limit error, continue loop to try next free fallback model
    } catch {
      // try next candidate model
    }
  }

  return { error: "LLM-Verbindung fehlgeschlagen (alle KI-Modelle ausgelastet)" }
}

// Vision-Aufruf: beschreibt/analysiert ein Bild anhand seiner (öffentlich erreichbaren) URL.
// Nutzt das konfigurierte Modell (gpt-4o-mini ist multimodal).
export async function askLLMVision(system: string, userText: string, imageUrl: string, maxTokens = 600): Promise<LLMResult> {
  const key = process.env.LLM_API_KEY
  if (!key) return { error: "not_configured" }
  const isOpenRouter = key.startsWith("sk-or-")
  const isAnthropic = key.startsWith("sk-ant-")
  const model = process.env.LLM_MODEL || (isOpenRouter ? "openai/gpt-4o-mini" : isAnthropic ? "claude-sonnet-4-6" : "gpt-4o-mini")

  try {
    if (isAnthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: maxTokens, system,
          messages: [{ role: "user", content: [
            { type: "text", text: userText },
            { type: "image", source: { type: "url", url: imageUrl } },
          ] }],
        }),
      })
      const d = await res.json()
      if (!res.ok) return { error: d?.error?.message || "Vision-Fehler" }
      return { text: d?.content?.[0]?.text }
    }
    const base = isOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"
    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "content-type": "application/json" }
    if (isOpenRouter) { headers["HTTP-Referer"] = "https://browns-perso.vercel.app"; headers["X-Title"] = "Browns Perso" }
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ] },
        ],
      }),
    })
    const d = await res.json()
    if (!res.ok) return { error: d?.error?.message || "Vision-Fehler" }
    return { text: d?.choices?.[0]?.message?.content }
  } catch (e: unknown) {
    return { error: (e as Error)?.message || "Verbindung fehlgeschlagen" }
  }
}
