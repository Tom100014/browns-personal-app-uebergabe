import { redirect } from "next/navigation"
import PortalNav from "@/components/portal/PortalNav"
import { getCurrentStaff } from "@/lib/staff"

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  // The owner / management use the full admin area, not the employee portal.
  if (staff.isManager && !staff.employee) redirect("/dashboard")
  if (!staff.employee) redirect("/kein-zugang")

  return (
    <div className="lg:flex lg:h-screen lg:overflow-hidden bg-background min-h-screen">
      <PortalNav name={staff.employee.name} color={staff.employee.color} />
      {/* pb-24: Platz für die mobile Bottom-Tab-Bar (inkl. iOS Safe-Area) */}
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 lg:overflow-y-auto pt-20 lg:pt-0 pb-28 lg:pb-8 focus:outline-none">
        <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  )
}
