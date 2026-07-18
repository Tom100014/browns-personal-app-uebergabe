"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Home, Calendar, Clock, CalendarOff, LifeBuoy,
  MessageSquare, CheckSquare, User, LogOut, Menu, X, BarChart3, HelpCircle, MoreHorizontal
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import Logo from "@/components/brand/Logo"

const nav = [
  { href: "/portal", icon: Home, label: "Start", exact: true },
  { href: "/portal/dienstplan", icon: Calendar, label: "Mein Plan" },
  { href: "/portal/stempeln", icon: Clock, label: "Stempeln" },
  { href: "/portal/stunden", icon: BarChart3, label: "Meine Stunden" },
  { href: "/portal/abwesenheit", icon: CalendarOff, label: "Abwesenheit" },
  { href: "/portal/vertretung", icon: LifeBuoy, label: "Vertretung" },
  { href: "/portal/chat", icon: MessageSquare, label: "Team-Chat" },
  { href: "/portal/checklisten", icon: CheckSquare, label: "Checklisten" },
  { href: "/portal/profil", icon: User, label: "Mein Profil" },
  { href: "/portal/hilfe", icon: HelpCircle, label: "Hilfe" },
]

// Die 4 täglichen Aktionen — mit einem Daumen-Tipp erreichbar. "Mehr" öffnet das Menü.
const tabs = [
  { href: "/portal", icon: Home, label: "Start", exact: true },
  { href: "/portal/dienstplan", icon: Calendar, label: "Plan", exact: false },
  { href: "/portal/stempeln", icon: Clock, label: "Stempeln", exact: false },
  { href: "/portal/chat", icon: MessageSquare, label: "Chat", exact: false },
]

export default function PortalNav({ name, color }: { name: string; color: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const drawerRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const drawer = drawerRef.current
    if (!drawer) return

    if (open && !drawer.open) {
      drawer.showModal()
      requestAnimationFrame(() => closeButtonRef.current?.focus())
    } else if (!open && drawer.open) {
      drawer.close()
    }
  }, [open])

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)")
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  const openDrawer = (trigger: HTMLButtonElement) => {
    triggerRef.current = trigger
    setOpen(true)
  }

  const renderProfile = () => (
    <div className="flex items-center gap-2.5 rounded-2xl border border-brand-100 bg-brand-50 px-3 py-2.5 shadow-card">
      <div aria-hidden="true" className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-card" style={{ backgroundColor: color }}>
        {initials}
      </div>
      <span className="text-sm font-bold text-charcoal truncate">{name}</span>
    </div>
  )

  const renderNavLinks = () => (
    <>
      {nav.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
              active ? "bg-brand-500 text-white shadow-sm shadow-brand-200/70" : "text-muted-foreground hover:bg-brand-50 hover:text-brand-700")}>
            <Icon aria-hidden="true" className={cn("w-4 h-4 flex-shrink-0", active ? "text-white" : "text-muted-foreground")} />
            {label}
          </Link>
        )
      })}
    </>
  )

  const renderLogoutBtn = () => (
    <button type="button" onClick={logout}
      className="flex min-h-11 items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-gray-100 hover:text-charcoal transition-all">
      <LogOut aria-hidden="true" className="w-4 h-4" /> Abmelden
    </button>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="brand-topbar lg:hidden fixed top-0 inset-x-0 z-30 h-20 border-b border-brand-700/20 flex items-center justify-between px-4">
        <Logo variant="light" className="h-14 w-14 ring-[3px]" />
        <button type="button" onClick={event => openDrawer(event.currentTarget)} aria-label="Menü öffnen"
          aria-expanded={open} aria-controls="portal-mobile-menu"
          className="inline-flex size-11 items-center justify-center rounded-xl text-charcoal hover:bg-white/25">
          <Menu aria-hidden="true" className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Bottom-Tab-Bar — tägliche Aktionen ohne Menü erreichbar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_-24px_rgba(47,44,41,0.45)]"
        aria-label="Hauptnavigation">
        <div className="grid grid-cols-5">
          {tabs.map(({ href, icon: Icon, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-12 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition",
                  active ? "text-brand-700" : "text-muted-foreground")}>
                <span className={cn("flex items-center justify-center w-10 h-7 rounded-full transition",
                  active && "bg-brand-100 shadow-sm")}>
                  <Icon aria-hidden="true" className="w-[18px] h-[18px]" />
                </span>
                {label}
              </Link>
            )
          })}
          <button type="button" onClick={event => openDrawer(event.currentTarget)} aria-label="Weitere Navigation öffnen"
            aria-expanded={open} aria-controls="portal-mobile-menu"
            className="flex min-h-12 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold text-muted-foreground">
            <span className="flex items-center justify-center w-10 h-7"><MoreHorizontal aria-hidden="true" className="w-[18px] h-[18px]" /></span>
            Mehr
          </button>
        </div>
      </nav>

      {/* Mobile drawer + overlay */}
      <dialog ref={drawerRef} id="portal-mobile-menu" aria-labelledby="portal-mobile-menu-title"
        onCancel={event => { event.preventDefault(); setOpen(false) }}
        onClose={() => { setOpen(false); triggerRef.current?.focus() }}
        onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}
        className="lg:hidden fixed inset-0 z-40 m-0 h-dvh max-h-none w-full max-w-none bg-charcoal/35 p-0 backdrop:bg-transparent backdrop:backdrop-blur-sm">
          <aside className="h-full w-80 max-w-[84vw] bg-white flex flex-col shadow-xl">
            <h2 id="portal-mobile-menu-title" className="sr-only">Portalmenü</h2>
            <div className="brand-topbar flex items-center justify-between px-4 py-4 border-b border-brand-700/20">
              <Logo variant="light" className="h-14 w-14 ring-[3px]" />
              <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="Menü schließen" className="inline-flex size-11 items-center justify-center rounded-xl text-charcoal hover:bg-white/25">
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>
            <div className="px-2 pt-3">{renderProfile()}</div>
            <nav aria-label="Portalmenü mobil" className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">{renderNavLinks()}</nav>
            <div className="px-2 pb-3 pt-2 border-t border-border">{renderLogoutBtn()}</div>
          </aside>
      </dialog>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 h-screen sticky top-0 flex-col bg-white border-r border-border">
        <div className="brand-topbar flex justify-center px-4 py-5 border-b border-brand-700/20"><Logo variant="light" className="h-[76px] w-[76px]" /></div>
        <div className="px-2 pt-3">{renderProfile()}</div>
        <nav aria-label="Portalmenü" className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">{renderNavLinks()}</nav>
        <div className="px-2 pb-3 pt-2 border-t border-border">{renderLogoutBtn()}</div>
      </aside>
    </>
  )
}
