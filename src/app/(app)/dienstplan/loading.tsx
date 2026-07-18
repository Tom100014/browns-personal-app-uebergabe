export default function DienstplanLoading() {
  return (
    <div className="h-full p-4 sm:p-6" role="status" aria-busy="true">
      <span className="sr-only">Dienstplan wird geladen</span>
      <div className="mb-5 h-12 w-72 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-[620px] animate-pulse rounded-lg border border-gray-200 bg-white" />
    </div>
  )
}
