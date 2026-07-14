import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Brown's Coffee Lounge",
    short_name: "Brown's",
    description: "Dienstplan, Zeiterfassung & Team für Browns Coffee Lounge",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f1e7",
    theme_color: "#ff6818",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
