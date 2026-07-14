export const KNOWLEDGE_META_MARKER = "[[BROWNS_META]]"

export const KNOWLEDGE_CATEGORIES = [
  { value: "arbeitsliste", label: "Arbeitsliste" },
  { value: "beleg", label: "Beleg" },
  { value: "dienstplan", label: "Dienstplan" },
  { value: "mitarbeiter", label: "Mitarbeiter" },
  { value: "krankheit", label: "Krankheit" },
  { value: "leistung", label: "Leistung" },
  { value: "fehler", label: "Fehler" },
  { value: "zusammenarbeit", label: "Zusammenarbeit" },
  { value: "training", label: "Training" },
  { value: "betrieb", label: "Betrieb" },
  { value: "tageslernen", label: "Tageslernen" },
  { value: "sonstiges", label: "Sonstiges" },
] as const

export const KNOWLEDGE_SIGNALS = [
  { value: "neutral", label: "neutral" },
  { value: "positiv", label: "positiv" },
  { value: "problem", label: "Problem" },
  { value: "krankheit", label: "Krankheit" },
  { value: "fehler", label: "Fehler" },
  { value: "lernen", label: "Lernen" },
] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]["value"]
export type KnowledgeSignal = (typeof KNOWLEDGE_SIGNALS)[number]["value"]

export type KnowledgeMeta = {
  category?: KnowledgeCategory | string
  signal?: KnowledgeSignal | string
  tags?: string[]
  employeeIds?: string[]
  employeeNames?: string[]
  sourceDate?: string
  scope?: "team" | "employee" | "business"
}

export type KnowledgeDoc = {
  id?: string
  title: string
  note?: string | null
  kind?: string | null
  extracted?: string | null
  created_at?: string | null
}

export function normalizeTags(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",")
  return [...new Set(raw.map(tag => tag.trim()).filter(Boolean).map(tag => tag.slice(0, 34)))]
}

function cleanMeta(meta: KnowledgeMeta): KnowledgeMeta {
  return {
    category: meta.category || undefined,
    signal: meta.signal || undefined,
    tags: normalizeTags(meta.tags),
    employeeIds: meta.employeeIds?.filter(Boolean) ?? undefined,
    employeeNames: meta.employeeNames?.filter(Boolean) ?? undefined,
    sourceDate: meta.sourceDate || undefined,
    scope: meta.scope || undefined,
  }
}

export function encodeKnowledgeNote(body: string, meta: KnowledgeMeta): string {
  const clean = cleanMeta(meta)
  const text = body.trim()
  return `${KNOWLEDGE_META_MARKER}${JSON.stringify(clean)}${text ? `\n${text}` : ""}`
}

export function parseKnowledgeNote(note?: string | null): { body: string; meta: KnowledgeMeta } {
  const text = String(note ?? "").trim()
  if (!text.startsWith(KNOWLEDGE_META_MARKER)) return { body: text, meta: {} }
  const [firstLine, ...rest] = text.split("\n")
  try {
    const meta = JSON.parse(firstLine.slice(KNOWLEDGE_META_MARKER.length)) as KnowledgeMeta
    return { body: rest.join("\n").trim(), meta: cleanMeta(meta) }
  } catch {
    return { body: text.replace(KNOWLEDGE_META_MARKER, "").trim(), meta: {} }
  }
}

export function categoryLabel(category?: string | null): string {
  return KNOWLEDGE_CATEGORIES.find(c => c.value === category)?.label ?? category ?? "Wissen"
}

export function signalLabel(signal?: string | null): string {
  return KNOWLEDGE_SIGNALS.find(s => s.value === signal)?.label ?? signal ?? "neutral"
}

export function knowledgeMetaLine(meta: KnowledgeMeta): string {
  const parts = [
    meta.category ? `Kategorie: ${categoryLabel(meta.category)}` : "",
    meta.signal ? `Signal: ${signalLabel(meta.signal)}` : "",
    meta.sourceDate ? `Datum: ${meta.sourceDate}` : "",
    meta.employeeNames?.length ? `Mitarbeiter: ${meta.employeeNames.join(", ")}` : "",
    meta.tags?.length ? `Tags: ${meta.tags.join(", ")}` : "",
  ].filter(Boolean)
  return parts.join(" | ")
}

export function formatKnowledgeDocsForAgent(docs: KnowledgeDoc[], maxDocs = 40): string {
  const lines = docs.slice(0, maxDocs).map(doc => {
    const parsed = parseKnowledgeNote(doc.note)
    const meta = knowledgeMetaLine(parsed.meta)
    const body = parsed.body ? `\n  Notiz: ${parsed.body.slice(0, 900)}` : ""
    const extracted = doc.extracted ? `\n  Erkannt: ${doc.extracted.slice(0, 1300)}` : ""
    const created = doc.created_at ? ` (${doc.created_at.slice(0, 10)})` : ""
    return `- ${doc.title}${created}${meta ? `\n  ${meta}` : ""}${body}${extracted}`
  })
  return lines.join("\n") || "(keine Dokumente)"
}
