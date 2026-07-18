import { redirect } from "next/navigation"
import Sidebar from "@/components/sidebar/Sidebar"
import { getCurrentStaff } from "@/lib/staff"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  // Regular employees use the dedicated employee portal, not the admin area.
  if (!staff.isManager) redirect("/portal")

  return (
    <div className="lg:flex lg:h-screen lg:overflow-hidden bg-background min-h-screen">
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="flex-1 lg:overflow-y-auto pt-20 lg:pt-0 focus:outline-none">
        {/* Inhaltsbreite auf sehr großen Monitoren begrenzen */}
        <div className="max-w-[1600px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
