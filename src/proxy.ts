import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Public routes: login, invite/set-password page, and PWA assets (service worker + manifest).
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/willkommen") ||
    path.startsWith("/kein-zugang") ||
    path.startsWith("/api/events/refresh") ||
    path.startsWith("/api/agent/learn") ||
    path.startsWith("/api/timeentries/autoclose") ||
    path === "/sw.js" ||
    path === "/manifest.webmanifest"

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (user && path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
