import type { Metadata, Viewport } from "next"
import { Manrope, Sora } from "next/font/google"
import "./globals.css"
import SWRegister from "@/components/push/SWRegister"
import InstallPrompt from "@/components/pwa/InstallPrompt"

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" })
const sora = Sora({ subsets: ["latin"], variable: "--font-display" })

export const metadata: Metadata = {
  applicationName: "Browns Perso",
  title: {
    default: "Browns Perso",
    template: "%s | Browns Perso",
  },
  description: "Dienstplan, Zeiterfassung und Mitarbeiterverwaltung für Browns Coffee Lounge",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Brown's" },
  icons: { apple: "/icons/apple-touch-icon.png" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff6818",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${manrope.variable} ${sora.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <a href="#main-content" className="skip-link">Zum Hauptinhalt springen</a>
        <SWRegister />
        {children}
        <InstallPrompt />
      </body>
    </html>
  )
}
