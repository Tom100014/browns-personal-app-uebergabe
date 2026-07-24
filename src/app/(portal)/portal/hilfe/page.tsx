import { Home, Calendar, Clock, BarChart3, CalendarOff, LifeBuoy, MessageSquare, CheckSquare } from "lucide-react"

const SECTIONS = [
  { icon: Home, title: "Start", points: ["Deine nächste Schicht und deine Stunden dieser Woche auf einen Blick."] },
  { icon: Calendar, title: "Mein Plan", points: [
    "Deine anstehenden Schichten.",
    "Der veröffentlichte Plan ist verbindlich — kein tägliches Bestätigen nötig.",
    "„Passt nicht — melden\": ein Tag geht nicht — die Leitung wird informiert, es wird Ersatz gesucht.",
  ] },
  { icon: Clock, title: "Stempeln", points: [
    "Ein- und Ausstempeln zu Schichtbeginn/-ende.",
    "Funktioniert nur im Browns-Café-WLAN.",
    "Pause beim Ausstempeln auswählen.",
  ] },
  { icon: BarChart3, title: "Meine Stunden", points: ["Deine erfassten Arbeitsstunden der letzten Wochen."] },
  { icon: CalendarOff, title: "Abwesenheit", points: [
    "Urlaub, Krankmeldung oder Frei-Wunsch beantragen.",
    "Die Leitung prüft und genehmigt den Antrag.",
  ] },
  { icon: LifeBuoy, title: "Vertretung", points: [
    "Hier siehst du gesuchte Vertretungen.",
    "Mit „Ich kann übernehmen\" springst du ein — die Leitung bestätigt.",
  ] },
  { icon: MessageSquare, title: "Team-Chat", points: ["Schreib mit deinen Kollegen und der Leitung."] },
  { icon: CheckSquare, title: "Checklisten", points: ["Hak deine Aufgaben während der Schicht ab."] },
]

export default function HilfePage() {
  return (
    <div className="min-w-0">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Hilfe</h1>
        <p className="text-gray-500 text-sm mt-0.5">So nutzt du die Browns Mitarbeiter-App</p>
      </div>
      <div className="space-y-3">
        {SECTIONS.map(({ icon: Icon, title, points }) => (
          <div key={title} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-gray-600" />
              </div>
              <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
            </div>
            <ul className="space-y-1.5">
              {points.map((p, i) => (
                <li key={i} className="text-sm text-gray-600 leading-relaxed flex gap-2">
                  <span className="text-brand-500 mt-0.5">•</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
