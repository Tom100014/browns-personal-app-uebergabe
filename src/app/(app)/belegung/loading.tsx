export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-slate-200 rounded-xl" />
      <div className="h-4 w-96 bg-slate-100 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-44 bg-slate-100 rounded-3xl" />
        ))}
      </div>
      <div className="h-80 bg-slate-100 rounded-3xl" />
    </div>
  )
}
