"use client"

import { useEffect, useState } from "react"
import { X, Share, Plus, Download } from "lucide-react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "browns_pwa_install_dismissed"

/**
 * Installier-Banner für die PWA. Zeigt auf Android/Chrome/Edge einen echten
 * "Installieren"-Button (beforeinstallprompt); auf iOS Safari (das kein
 * beforeinstallprompt kennt) einen kurzen "Zum Home-Bildschirm"-Hinweis.
 * Erscheint nicht, wenn die App bereits installiert (standalone) läuft oder
 * der Nutzer den Hinweis weggetippt hat.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return
    if (localStorage.getItem(DISMISS_KEY) === "1") return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    const onInstalled = () => {
      localStorage.setItem(DISMISS_KEY, "1")
      setShow(false)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)

    // iOS Safari feuert kein beforeinstallprompt → eigener Hinweis.
    const ua = window.navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
    if (isIOS && isSafari) {
      setIosHint(true)
      setShow(true)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1")
    setShow(false)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    try { await deferred.userChoice } catch { /* ignoriert */ }
    setDeferred(null)
    setShow(false)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-3 sm:bottom-4">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-brand-200/70 bg-white/95 p-3.5 shadow-xl backdrop-blur">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-black text-white">B</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Brown&apos;s als App installieren</p>
          {iosHint ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
              Tippe auf <Share className="inline h-3.5 w-3.5" /> Teilen, dann
              <span className="inline-flex items-center gap-0.5"><Plus className="h-3.5 w-3.5" />&bdquo;Zum Home-Bildschirm&ldquo;</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">Schneller Zugriff, Vollbild &amp; Push — direkt vom Startbildschirm.</p>
          )}
        </div>
        {!iosHint && (
          <button onClick={install}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700">
            <Download className="h-4 w-4" /> Installieren
          </button>
        )}
        <button onClick={dismiss} aria-label="Hinweis schließen"
          className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
