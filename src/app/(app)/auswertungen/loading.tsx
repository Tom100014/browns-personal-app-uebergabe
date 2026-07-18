export default function AuswertungenLoading() {
  return (
    <div className="max-w-5xl p-4 sm:p-6" role="status" aria-busy="true">
      <span className="sr-only">Auswertungen werden geladen</span>
      <div className="mb-5 h-12 w-96 max-w-full animate-pulse rounded-lg bg-slate-200" />
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg border border-gray-200 bg-white" />)}
      </div>
      <div className="h-96 animate-pulse rounded-lg border border-gray-200 bg-white" />
    </div>
  )
}
