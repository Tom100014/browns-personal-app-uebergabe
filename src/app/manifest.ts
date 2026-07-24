import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Brown's Coffee Lounge",
    short_name: "Brown's",
    description: "Dienstplan, Zeiterfassung & Team für Browns Coffee Lounge",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8f1e7",
    theme_color: "#ff6818",
    lang: "de",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Stempeln", short_name: "Stempeln", url: "/portal/stempeln", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mein Dienstplan", short_name: "Dienstplan", url: "/portal/dienstplan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Team-Chat", short_name: "Chat", url: "/portal/chat", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  }
}
