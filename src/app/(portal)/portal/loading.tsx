export default function PortalLoading() {
  return (
    <div className="min-h-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8" role="status" aria-busy="true">
      <span className="sr-only">Portal wird geladen</span>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <div className="h-24 animate-pulse rounded-lg bg-white/70" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-lg bg-white/70" />)}
          </div>
        </div>
        <div className="h-[520px] animate-pulse rounded-lg bg-white/70" />
      </div>
    </div>
  )
}
