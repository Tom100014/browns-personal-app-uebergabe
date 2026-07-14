// Prüft, ob eine Client-IP zur erlaubten Café-Konfiguration passt.
// Unterstützt mehrere IPs (kommagetrennt) und "/24" für das gesamte Netz
// (dynamische IPs). Wird serverseitig genutzt, damit die Café-IP NIE an den
// Client (Mitarbeiter-Browser) gelangt.
export function ipAllowed(ip: string, allowed: string): boolean {
  const net24 = (x: string) => x.split(".").slice(0, 3).join(".")
  return allowed.split(",").map(s => s.trim()).filter(Boolean).some(entry => {
    if (entry.endsWith("/24")) return net24(ip) === net24(entry.replace("/24", ""))
    return ip === entry
  })
}
