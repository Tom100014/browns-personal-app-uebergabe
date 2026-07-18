import path from "node:path"

export const MAX_UPLOAD_BYTES = {
  knowledge: 4 * 1024 * 1024,
  document: 4 * 1024 * 1024,
  sicknote: 4 * 1024 * 1024,
} as const

export type UploadScope = keyof typeof MAX_UPLOAD_BYTES

type FileRule = {
  mime: string
  scopes: UploadScope[]
  magic: (bytes: Uint8Array) => boolean
}

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value)

const isText = (bytes: Uint8Array) => {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 64 * 1024))
    return true
  } catch {
    return false
  }
}

const RULES: Record<string, FileRule> = {
  pdf: { mime: "application/pdf", scopes: ["knowledge", "document", "sicknote"], magic: bytes => startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  png: { mime: "image/png", scopes: ["knowledge", "document", "sicknote"], magic: bytes => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", scopes: ["knowledge", "document", "sicknote"], magic: bytes => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", scopes: ["knowledge", "document", "sicknote"], magic: bytes => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  webp: { mime: "image/webp", scopes: ["knowledge", "document", "sicknote"], magic: bytes => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
  heic: { mime: "image/heic", scopes: ["document", "sicknote"], magic: bytes => String.fromCharCode(...bytes.slice(4, 12)).match(/^ftyp(?:heic|heix|hevc|hevx|mif1|msf1)$/) !== null },
  doc: { mime: "application/msword", scopes: ["document"], magic: bytes => startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", scopes: ["knowledge", "document"], magic: bytes => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", scopes: ["knowledge"], magic: bytes => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) },
  txt: { mime: "text/plain", scopes: ["knowledge"], magic: isText },
  md: { mime: "text/markdown", scopes: ["knowledge"], magic: isText },
  csv: { mime: "text/csv", scopes: ["knowledge"], magic: isText },
  tsv: { mime: "text/tab-separated-values", scopes: ["knowledge"], magic: isText },
}

export type ValidatedUpload = { extension: string; contentType: string; safeName: string }

export function safeUploadName(name: string): string {
  const base = path.basename(name).normalize("NFKC")
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-140)
  return cleaned || "upload"
}

export async function validateUpload(file: File, scope: UploadScope): Promise<ValidatedUpload> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES[scope]) {
    throw new Error(`Dateigröße ist ungültig (maximal ${Math.floor(MAX_UPLOAD_BYTES[scope] / 1024 / 1024)} MB).`)
  }
  const safeName = safeUploadName(file.name)
  const extension = path.extname(safeName).slice(1).toLowerCase()
  const rule = RULES[extension]
  if (!rule || !rule.scopes.includes(scope)) throw new Error("Dieser Dateityp ist nicht erlaubt.")

  const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
  if (!rule.magic(bytes)) throw new Error("Dateiinhalt und Dateiendung stimmen nicht überein.")

  const suppliedType = file.type.trim().toLowerCase()
  const compatibleTypes = new Set(["", "application/octet-stream", rule.mime])
  if (extension === "jpg" || extension === "jpeg") compatibleTypes.add("image/jpg")
  if (extension === "csv") compatibleTypes.add("application/vnd.ms-excel")
  if (!compatibleTypes.has(suppliedType)) throw new Error("Der gemeldete Dateityp ist nicht erlaubt.")

  return { extension, contentType: rule.mime, safeName }
}
