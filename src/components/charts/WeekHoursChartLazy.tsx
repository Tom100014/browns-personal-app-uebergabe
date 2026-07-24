import dynamic from "next/dynamic"

const Chart = dynamic(() => import("./WeekHoursChart"), { ssr: true, loading: () => <div className="h-48 bg-gray-100 rounded animate-pulse" /> })

export default function WeekHoursChartLazy({ data }: { data: any[] }) {
  return <Chart data={data} />
}
