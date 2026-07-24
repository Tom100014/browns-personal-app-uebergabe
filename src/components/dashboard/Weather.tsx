"use client"

import { useEffect, useState, useCallback } from "react"
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, MapPin, Save, Umbrella, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Day = { date: string; code: number; tmax: number; tmin: number; rain: number }

function iconFor(code: number) {
  if (code === 0) return { Icon: Sun, color: "text-amber-500" }
  if (code <= 3) return { Icon: CloudSun, color: "text-amber-400" }
  if (code === 45 || code === 48) return { Icon: CloudFog, color: "text-gray-400" }
  if (code >= 51 && code <= 67) return { Icon: CloudRain, color: "text-sky-500" }
  if (code >= 71 && code <= 77) return { Icon: CloudSnow, color: "text-sky-300" }
  if (code >= 80 && code <= 82) return { Icon: CloudRain, color: "text-sky-600" }
  if (code >= 95) return { Icon: CloudLightning, color: "text-violet-500" }
  return { Icon: Cloud, color: "text-gray-400" }
}

function wxBgImage(code: number): string {
  if (code === 0) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80"
  if (code <= 3) return "https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=400&q=80"
  if (code === 45 || code === 48) return "https://images.unsplash.com/photo-1487621167305-5d248087c724?auto=format&fit=crop&w=400&q=80"
  if (code >= 51 && code <= 67) return "https://images.unsplash.com/photo-1519692933481-e162a57d6721?auto=format&fit=crop&w=400&q=80"
  if (code >= 71 && code <= 77) return "https://images.unsplash.com/photo-1517299321529-639f8c26d4a1?auto=format&fit=crop&w=400&q=80"
  if (code >= 80 && code <= 82) return "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=400&q=80"
  if (code >= 95) return "https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?auto=format&fit=crop&w=400&q=80"
  return "https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=400&q=80"
}

/** Outdoor-area staffing hint based on weather (warm + dry = more Service outside). */
function staffHint(d: Day): { level: "hoch" | "mittel" | "ruhig"; text: string } {
  const dry = d.rain < 40
  if (d.tmax >= 22 && dry) return { level: "hoch", text: "Außenbereich stark — mehr Service einplanen" }
  if (d.tmax >= 18 && dry) return { level: "mittel", text: "Außenbereich offen — normale Besetzung" }
  if (d.rain >= 60 || d.tmax < 14) return { level: "ruhig", text: "Eher Innenbetrieb — weniger Außen-Service" }
  return { level: "mittel", text: "Gemischt — flexibel planen" }
}

const dayName = (s: string) => new Date(s).toLocaleDateString("de-DE", { weekday: "short" })

export default function Weather() {
  const [city, setCity] = useState<string | null>(null)
  const [cityInput, setCityInput] = useState("")
  const [place, setPlace] = useState("")
  const [days, setDays] = useState<Day[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadForecast = useCallback(async (c: string) => {
    setLoading(true)
    try {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=1&language=de&format=json`).then(r => r.json())
      const g = geo?.results?.[0]
      if (!g) { setDays([]); setLoading(false); return }
      setPlace(`${g.name}${g.country_code ? ", " + g.country_code : ""}`)
      const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=6&timezone=auto`).then(r => r.json())
      const d: Day[] = (f?.daily?.time ?? []).map((t: string, i: number) => ({
        date: t, code: f.daily.weather_code[i], tmax: Math.round(f.daily.temperature_2m_max[i]),
        tmin: Math.round(f.daily.temperature_2m_min[i]), rain: f.daily.precipitation_probability_max?.[i] ?? 0,
      }))
      setDays(d)
    } catch { setDays([]) }
    setLoading(false)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.from("settings").select("value").eq("key", "weather_city").maybeSingle().then(({ data }) => {
      const c = data?.value || ""
      setCity(c || null); setCityInput(c)
      if (c) loadForecast(c)
      else setLoading(false)
    })
  }, [loadForecast])

  async function saveCity() {
    if (!cityInput.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from("settings").upsert({ key: "weather_city", value: cityInput.trim() })
    setCity(cityInput.trim()); setSaving(false)
    loadForecast(cityInput.trim())
  }

  const LEVEL = {
    hoch: "bg-amber-50 text-amber-700 border-amber-200",
    mittel: "bg-gray-100 text-gray-600 border-gray-200",
    ruhig: "bg-sky-50 text-sky-700 border-sky-200",
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 shadow-xs">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-500 animate-pulse" /> Wetter &amp; Außenbereich-Planung
          {place && <span className="text-gray-400 font-normal inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{place}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <input value={cityInput} onChange={e => setCityInput(e.target.value)} placeholder="Stadt (z.B. Wien)"
            className="w-36 px-2.5 py-1.5 rounded-xl border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          <button onClick={saveCity} disabled={saving}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium transition disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> Setzen
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Wetterdaten werden geladen…</p>
      ) : !city ? (
        <p className="text-sm text-gray-400">Standort oben eintragen, um Wetter &amp; Personal-Empfehlung zu sehen.</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-gray-400">Keine Wetterdaten für &quot;{city}&quot;. Stadt prüfen.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-3">
            {days.map(d => {
              const { Icon, color } = iconFor(d.code)
              const h = staffHint(d)
              const bg = wxBgImage(d.code)
              return (
                <div key={d.date} className="relative overflow-hidden rounded-2xl border border-gray-200 p-3 text-center group transition hover:scale-105 shadow-xs">
                  <div className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-overlay transition group-hover:scale-110 duration-500 pointer-events-none" style={{ backgroundImage: `url('${bg}')` }} />
                  <div className="relative z-10">
                    <p className="text-xs text-gray-700 font-bold capitalize">{dayName(d.date)}</p>
                    <Icon className={cn("w-6 h-6 mx-auto my-1.5 drop-shadow-xs", color)} />
                    <p className="text-base font-black text-gray-900">{d.tmax}°</p>
                    <p className="text-[10px] text-gray-500 font-medium">{d.tmin}° · <Umbrella className="w-2.5 h-2.5 inline" />{d.rain}%</p>
                    <span className={cn("mt-2 inline-block w-full text-[10px] px-1 py-0.5 rounded-lg border font-bold uppercase", LEVEL[h.level])}>
                      {h.level === "hoch" ? "viel los" : h.level === "ruhig" ? "ruhig" : "normal"}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {(() => {
            const today = staffHint(days[0])
            return (
              <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", LEVEL[today.level])}>
                <Users className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed"><strong>Heute:</strong> {today.text}.</p>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
