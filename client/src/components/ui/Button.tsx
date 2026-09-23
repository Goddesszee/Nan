import React from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'success' | 'soft' | 'secondary'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
}

const base = [
  'inline-flex items-center justify-center gap-2 font-semibold',
  'border cursor-pointer select-none',
  'transition-all duration-200 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]',
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
].join(' ')

const variants: Record<Variant, string> = {
  primary: [
    'bg-[#2563EB] text-white border-transparent',
    'hover:bg-[#1D4ED8] hover:shadow-[0_8px_24px_rgba(37,99,235,0.38)]',
    'active:bg-[#1a40b8] active:scale-[0.98]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[#F4F4F8] border-[rgba(37,99,235,0.22)]',
    'hover:border-[rgba(37,99,235,0.4)] hover:bg-[rgba(37,99,235,0.06)]',
    'active:scale-[0.98]',
  ].join(' '),
  danger: [
    'bg-[#ef4444] text-white border-transparent',
    'hover:bg-[#dc2626] hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]',
    'active:scale-[0.98]',
  ].join(' '),
  success: [
    'bg-[#22C55E] text-white border-transparent',
    'hover:bg-[#16a34a] hover:shadow-[0_6px_20px_rgba(34,197,94,0.3)]',
    'active:scale-[0.98]',
  ].join(' '),
  soft: [
    'bg-[rgba(37,99,235,0.1)] text-[#60A5FA] border-[rgba(37,99,235,0.22)]',
    'hover:bg-[rgba(37,99,235,0.18)] hover:border-[rgba(37,99,235,0.4)]',
    'active:scale-[0.98]',
  ].join(' '),
  secondary: [
    'bg-[rgba(255,255,255,0.06)] text-[#F4F4F8] border-[rgba(255,255,255,0.1)]',
    'hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.18)]',
    'active:scale-[0.98]',
  ].join(' '),
}

const sizes: Record<Size, string> = {
  sm: 'text-[13px] px-3.5 py-2 rounded-[9px]',
  md: 'text-[14px] px-5 py-[11px] rounded-[10px]',
  lg: 'text-[15px] px-7 py-[14px] rounded-[11px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[base, variants[variant], sizes[size], fullWidth ? 'w-full' : '', className].join(' ')}
      style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em', ...props.style }}
    >
      {loading ? (
        <span
          className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"
          style={{ animation: 'nan-spin 0.8s linear infinite' }}
        />
      ) : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}

export function IconButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        'inline-flex items-center justify-center w-9 h-9 rounded-[10px]',
        'bg-[rgba(37,99,235,0.08)] border border-[rgba(37,99,235,0.18)] text-[#9AA0B0]',
        'hover:bg-[rgba(37,99,235,0.14)] hover:text-[#F4F4F8] hover:border-[rgba(37,99,235,0.32)]',
        'transition-all duration-200 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
