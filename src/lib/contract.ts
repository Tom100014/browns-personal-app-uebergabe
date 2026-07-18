export type ContractData = {
  contractKind?: "standard" | "minijob" | "aushilfe" | "teilzeit" | "vollzeit" | "werkstudent"
  employerName: string
  employerAddress: string
  employeeName: string
  employeeAddress: string
  birthDate: string
  position: string
  employmentType: string // Vollzeit | Teilzeit | Minijob | Aushilfe
  wage: string // €/h
  weeklyHours: string
  startDate: string
  probationMonths: string
  vacationDays: string
  noticePeriod: string
  extra: string
  workLocation?: string
  collectiveAgreement?: string
}

function fmtDate(d: string): string {
  if (!d) return "________"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "________"
  const [y, m, day] = d.split("-")
  return `${day}.${m}.${y}`
}

function esc(v?: string | null): string {
  return String(v ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[ch] ?? ch))
}

const TYPE_CLAUSE: Record<string, string> = {
  Minijob:
    "Das Arbeitsverhältnis wird als geringfügige Beschäftigung (Minijob) geführt. Die Vergütung und Einsatzplanung erfolgen unter Beachtung der jeweils geltenden gesetzlichen Geringfügigkeitsgrenze. Der/die Arbeitnehmer/in verpflichtet sich, weitere Beschäftigungen und Änderungen unverzüglich mitzuteilen.",
  Teilzeit:
    "Es handelt sich um ein Teilzeitarbeitsverhältnis mit der unten vereinbarten wöchentlichen Arbeitszeit.",
  Vollzeit:
    "Es handelt sich um ein Vollzeitarbeitsverhältnis mit der unten vereinbarten wöchentlichen Arbeitszeit.",
  Aushilfe:
    "Das Arbeitsverhältnis wird als Aushilfstätigkeit geführt. Die Arbeitszeit richtet sich nach betrieblichem Bedarf und Absprache.",
  Werkstudent:
    "Das Arbeitsverhältnis wird als Werkstudententätigkeit geführt. Der/die Arbeitnehmer/in versichert, die für Werkstudenten geltenden Voraussetzungen einzuhalten und Änderungen unverzüglich mitzuteilen.",
}

/** Builds a printable employment-contract draft as a full HTML document. */
export function buildContract(d: ContractData): { title: string; html: string } {
  const title = `Arbeitsvertrag - ${d.employeeName || "Mitarbeiter"}`
  const typeClause = TYPE_CLAUSE[d.employmentType] ?? TYPE_CLAUSE.Teilzeit
  const employer = esc(d.employerName || "Browns Coffee Lounge")
  const employee = esc(d.employeeName || "________")
  const employerAddress = esc(d.employerAddress)
  const employeeAddress = esc(d.employeeAddress)
  const workLocation = esc(d.workLocation || d.employerAddress || "Browns Coffee Lounge / Betriebsstätte des Arbeitgebers")
  const position = esc(d.position || "________")
  const wage = esc(d.wage)
  const weeklyHours = esc(d.weeklyHours)
  const vacationDays = esc(d.vacationDays)
  const probationMonths = esc(d.probationMonths)
  const noticePeriod = esc(d.noticePeriod)
  const collectiveAgreement = esc(d.collectiveAgreement || "Soweit einschlägig, gelten die gesetzlichen Bestimmungen sowie zwingende tarifliche/kollektivvertragliche Regelungen.")
  const extra = esc(d.extra || "Keine weiteren individuellen Vereinbarungen.")

  const body = `
  <h1>Arbeitsvertrag</h1>
  <p class="subline">Vorlage fuer Gastronomie / Cafébetrieb</p>
  <p class="parties">zwischen<br>
  <strong>${employer}</strong>${employerAddress ? `, ${employerAddress}` : ""}<br>
  - nachfolgend Arbeitgeber -<br><br>
  und<br/>
  <strong>${employee}</strong>${employeeAddress ? `, ${employeeAddress}` : ""}${d.birthDate ? `, geb. am ${fmtDate(d.birthDate)}` : ""}<br>
  - nachfolgend Arbeitnehmer/in -</p>

  <h2>§ 1 Beginn, Tätigkeit und Arbeitsort</h2>
  <p>Das Arbeitsverhältnis beginnt am <strong>${fmtDate(d.startDate)}</strong>. Der/die Arbeitnehmer/in wird als <strong>${position}</strong> im gastronomischen Betrieb des Arbeitgebers eingesetzt. Arbeitsort ist <strong>${workLocation}</strong>. Der Arbeitgeber kann dem/der Arbeitnehmer/in zumutbare, gleichwertige Tätigkeiten im Cafébetrieb zuweisen, insbesondere in Service, Theke, Küche, Spüle, Kasse, Reinigung und Vor-/Nachbereitung.</p>
  <p>${typeClause}</p>

  <h2>§ 2 Arbeitszeit, Dienstplan und Mehrarbeit</h2>
  <p>Die regelmäßige wöchentliche Arbeitszeit beträgt <strong>${weeklyHours || "____"} Stunden</strong>. Lage und Verteilung der Arbeitszeit richten sich nach dem Dienstplan und den betrieblichen Erfordernissen. Dienstplanänderungen werden möglichst frühzeitig mitgeteilt. Mehrarbeit, Sonn-/Feiertagsarbeit und Vertretungseinsätze erfolgen nur im gesetzlich zulässigen Rahmen und werden über die Zeiterfassung dokumentiert.</p>

  <h2>§ 3 Vergütung und Abrechnung</h2>
  <p>Der/die Arbeitnehmer/in erhält einen Stundenlohn von <strong>${wage ? wage + " EUR" : "____ EUR"}</strong> brutto. Die Abrechnung erfolgt monatlich auf Grundlage der genehmigten Arbeitszeiten. Trinkgelder, Sachbezüge und Zuschläge werden nach betrieblicher Regelung und den gesetzlichen Vorgaben behandelt.</p>

  <h2>§ 4 Urlaub</h2>
  <p>Der jährliche Urlaubsanspruch beträgt <strong>${vacationDays || "____"} Arbeitstage</strong> (anteilig bei unterjährigem Eintritt). Urlaub ist rechtzeitig zu beantragen und wird unter Berücksichtigung der betrieblichen Belange gewährt.</p>

  <h2>§ 5 Arbeitsunfähigkeit und Verhinderung</h2>
  <p>Arbeitsunfähigkeit oder sonstige Verhinderung ist dem Arbeitgeber unverzüglich vor Schichtbeginn mitzuteilen. Erforderliche Nachweise sind fristgerecht vorzulegen. Bei Krankheit gelten die gesetzlichen Vorschriften zur Entgeltfortzahlung.</p>

  <h2>§ 6 Probezeit und Kündigung</h2>
  <p>Die ersten <strong>${probationMonths || "__"} Monate</strong> gelten als Probezeit, soweit gesetzlich zulässig. Während der Probezeit gilt die gesetzliche verkürzte Kündigungsfrist. Danach gilt eine Kündigungsfrist von <strong>${noticePeriod || "____"}</strong>, mindestens jedoch die gesetzliche Frist.</p>

  <h2>§ 7 Betriebsordnung, Hygiene, Kasse und Sorgfalt</h2>
  <p>Der/die Arbeitnehmer/in verpflichtet sich, Hygiene-, Lebensmittel-, Arbeitsschutz-, Kassen- und Datenschutzvorgaben einzuhalten. Betriebsmittel, Waren, Schlüssel, Kassendaten und Kundendaten sind sorgfältig und vertraulich zu behandeln.</p>

  <h2>§ 8 Verschwiegenheit, Datenschutz und Nebentätigkeit</h2>
  <p>Über Betriebs- und Geschäftsgeheimnisse ist auch nach Beendigung des Arbeitsverhältnisses Stillschweigen zu bewahren. Personenbezogene Daten dürfen nur im Rahmen der Tätigkeit verarbeitet werden. Nebentätigkeiten sind mitzuteilen, soweit berechtigte betriebliche Interessen betroffen sind oder gesetzliche Grenzen berührt werden.</p>

  <h2>§ 9 Tarif / Kollektivvertrag / gesetzliche Regelungen</h2>
  <p>${collectiveAgreement}</p>

  <h2>§ 10 Sonstige Vereinbarungen</h2>
  <p>${extra}</p>

  <div class="signs">
    <div><div class="line"></div>Ort, Datum</div>
    <div><div class="line"></div>Arbeitgeber</div>
    <div><div class="line"></div>Arbeitnehmer:in</div>
  </div>

  <p class="disclaimer">Hinweis: Dieser Vertrag ist eine automatisch erstellte <strong>Vorlage</strong> und stellt keine Rechtsberatung dar. Bitte vor Verwendung von Steuerberater/in bzw. Anwalt/Anwältin prüfen lassen, insbesondere zu Geringfügigkeitsgrenzen, Mindestlohn, Tarif-/Kollektivvertrag, Kündigungsfristen und landesspezifischem Arbeitsrecht.</p>
  `

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"/><title>${esc(title)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:760px;margin:36px auto;padding:0 28px;line-height:1.55;}
    h1{font-size:26px;text-align:center;margin:0 0 4px;font-weight:800;}
    .subline{text-align:center;color:#64748b;font-size:12px;margin:0 0 24px;}
    h2{font-size:14px;margin-top:20px;border-bottom:1px solid #d9e2ef;padding-bottom:5px;color:#0f172a;}
    p{font-size:12.5px;margin:8px 0;}
    .parties{font-size:13px;}
    .signs{display:flex;gap:24px;margin-top:56px;font-size:12px;}
    .signs > div{flex:1;text-align:center;}
    .line{border-top:1px solid #333;margin-bottom:6px;height:1px;}
    .disclaimer{margin-top:40px;font-size:10px;color:#777;border-top:1px dashed #ccc;padding-top:10px;}
    @media print{body{margin:0;} .disclaimer{break-inside:avoid;}}
  </style></head><body>${body}</body></html>`

  return { title, html }
}
