"use client"

import dynamic from "next/dynamic"
import type { WeekHoursDatum } from "./WeekHoursChart"

// recharts pulls in a large chunk of JS that isn't needed for the dashboard's
// first paint. Loading it only on the client keeps it out of the dashboard
// route's First Load JS (was the single biggest contributor by far).
const WeekHoursChart = dynamic(() => import("./WeekHoursChart"), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-2xl bg-slate-100" />,
})

export default function WeekHoursChartLazy({ data }: { data: WeekHoursDatum[] }) {
  return <WeekHoursChart data={data} />
}
