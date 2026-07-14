"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Calendar, Users, Clock,
  LogOut, MessageSquare, CheckSquare,
  UserX, Settings, LifeBuoy, Menu, X, BarChart3, BookOpen, Server, Gauge, Bot
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import Logo from "@/components/brand/Logo"

type NavItem = { href: string; icon: typeof Calendar; label: string; badge?: "absences" | "coverage" }
type NavSection = { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: "Planung",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/dienstplan", icon: Calendar, label: "Dienstplan" },
      { href: "/belegung", icon: Gauge, label: "Belegung" },
      { href: "/zeiterfassung", icon: Clock, label: "Zeiterfassung" },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/abwesenheiten", icon: UserX, label: "Abwesenheiten", badge: "absences" },
      { href: "/vertretung", icon: LifeBuoy, label: "Vertretung", badge: "coverage" },
      { href: "/mitarbeiter", icon: Users, label: "Mitarbeiter" },
      { href: "/nachrichten", icon: MessageSquare, label: "Nachrichten" },
      { href: "/checklisten", icon: CheckSquare, label: "Checklisten" },
    ],
  },
  {
    title: "Steuerung",
    items: [
      { href: "/assistent", icon: Bot, label: "Browns Agent" },
      { href: "/auswertungen", icon: BarChart3, label: "Auswertungen" },
      { href: "/einstellungen", icon: Settings, label: "Einstellungen" },
      { href: "/handbuch", icon: BookOpen, label: "Handbuch" },
      { href: "/system", icon: Server, label: "System" },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<{ absences: number; coverage: number }>({ absences: 0, coverage: 0 })

  // Offene Anträge & Vertretungen als Badge direkt in der Navigation sichtbar.
  useEffect(() => {
    let active = true
    async function load() {
      const supabase = createClient()
      const [{ count: abs }, { count: cov }] = await Promise.all([
        supabase.from("absences").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("coverage_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
      ])
      if (active) setCounts({ absences: abs ?? 0, coverage: cov ?? 0 })
    }
    load()
    return () => { active = false }
  }, [pathname])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const badgeCount = (b?: NavItem["badge"]) => (b === "absences" ? counts.absences : b === "coverage" ? counts.coverage : 0)

  const renderNavLinks = () => (
    <>
      {SECTIONS.map(section => (
        <div key={section.title} className="mb-3">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase text-slate-400">{section.title}</p>
          <div className="space-y-0.5">
            {section.items.map(({ href, icon: Icon, label, badge }) => {
              const active = pathname.startsWith(href)
              const n = badgeCount(badge)
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                    active ? "bg-brand-500 text-white shadow-sm shadow-brand-200/70" : "text-muted-foreground hover:bg-brand-50 hover:text-brand-700"
                  )}>
                  <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-white" : "text-muted-foreground")} />
                  <span className="flex-1">{label}</span>
                  {n > 0 && (
                    <span className={cn("text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                      active ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700")}>
                      {n}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )

  const renderLogoutButton = () => (
    <button onClick={handleLogout}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-gray-100 hover:text-charcoal transition-all">
      <LogOut className="w-4 h-4" /> Abmelden
    </button>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="brand-topbar lg:hidden fixed top-0 inset-x-0 z-30 h-20 border-b border-brand-700/20 flex items-center justify-between px-4">
        <Logo variant="light" className="h-14 w-14 ring-[3px]" />
        <button onClick={() => setOpen(true)} aria-label="Menü öffnen"
          className="p-2 -mr-2 rounded-xl text-charcoal hover:bg-white/25">
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile drawer + overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-charcoal/35 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white flex flex-col shadow-xl">
            <div className="brand-topbar flex items-center justify-between px-4 py-4 border-b border-brand-700/20">
              <Logo variant="light" className="h-14 w-14 ring-[3px]" />
              <button onClick={() => setOpen(false)} aria-label="Menü schließen"
                className="p-1.5 rounded-xl text-charcoal hover:bg-white/25">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-2 py-4 overflow-y-auto">{renderNavLinks()}</nav>
            <div className="px-2 pb-3 pt-2 border-t border-border">{renderLogoutButton()}</div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 h-screen sticky top-0 flex-col bg-white border-r border-border">
        <div className="brand-topbar flex justify-center px-4 py-5 border-b border-brand-700/20"><Logo variant="light" className="h-[76px] w-[76px]" /></div>
        <nav className="flex-1 px-2 py-4 overflow-y-auto">{renderNavLinks()}</nav>
        <div className="px-2 pb-3 pt-2 border-t border-border">{renderLogoutButton()}</div>
      </aside>
    </>
  )
}
