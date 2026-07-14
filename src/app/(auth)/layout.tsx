export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/brand/storefront.jpg)" }} aria-hidden />
      <div className="absolute inset-0 bg-charcoal/72" aria-hidden />
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  )
}
