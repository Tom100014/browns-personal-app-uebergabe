export default function DashboardLoading() {
  return (
    <div className="max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8" role="status" aria-busy="true">
      <span className="sr-only">Dashboard wird geladen</span>
      <div className="h-24 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-lg bg-white shadow-card" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="h-96 animate-pulse rounded-lg bg-white shadow-card" />
        <div className="h-96 animate-pulse rounded-lg bg-white shadow-card" />
      </div>
    </div>
  )
}
