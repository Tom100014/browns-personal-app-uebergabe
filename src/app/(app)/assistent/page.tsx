import Assistant from "@/components/assistent/Assistant"

export default function AssistentPage() {
  return (
    <div className="min-w-0">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Browns Agent</h1>
        <p className="text-gray-500 text-sm mt-0.5">Dein Planungs-Agent — kennt Team, Wetter, Veranstaltungen &amp; Regeln, und trägt Pläne direkt ins System ein</p>
      </div>
      <Assistant />
    </div>
  )
}
