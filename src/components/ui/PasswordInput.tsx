"use client"

import { useState, forwardRef } from "react"
import { Eye, EyeOff, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  showStrength?: boolean
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, showStrength = false, value, onChange, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    const strValue = typeof value === "string" ? value : ""
    const hasMinLength = strValue.length >= 8
    const hasNumberOrSpecial = /[0-9!@#$%^&*()]/.test(strValue)

    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <div className="pointer-events-none absolute left-3 flex items-center text-gray-400">
            <Lock className="h-4 w-4" />
          </div>
          <input
            ref={ref}
            type={showPassword ? "text" : "password"}
            value={value}
            onChange={onChange}
            className={cn(
              "w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword(prev => !prev)}
            title={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            className="absolute right-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-brand-600" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>

        {showStrength && strValue.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-1 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  strValue.length === 0 ? "w-0" : hasMinLength && hasNumberOrSpecial ? "w-full bg-emerald-500" : hasMinLength ? "w-2/3 bg-amber-500" : "w-1/3 bg-red-500"
                )}
              />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className={cn(hasMinLength ? "text-emerald-600 font-medium" : "text-gray-400")}>
                ✓ Mind. 8 Zeichen
              </span>
              <span className={cn(hasNumberOrSpecial ? "text-emerald-600 font-medium" : "text-gray-400")}>
                ✓ Zahlen/Sonderzeichen
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
        )}
      </div>
    )
  }
)

PasswordInput.displayName = "PasswordInput"
