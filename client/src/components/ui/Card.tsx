import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'balance' | 'glow' | 'flat'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variants = {
  default: 'bg-[rgba(255,255,255,0.04)] border border-[rgba(37,99,235,0.18)] shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(37,99,235,0.12),inset_0_0_0_0.5px_rgba(255,255,255,0.03)]',
  balance: 'bg-[linear-gradient(145deg,#1a1a1a_0%,#111111_50%,#1a1a1a_100%)] border border-[rgba(255,255,255,0.08)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden relative',
  glow:    'bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.22)] shadow-[0_4px_20px_rgba(37,99,235,0.12)]',
  flat:    'bg-[#15151D] border border-[rgba(37,99,235,0.14)]',
}

const paddings = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-7',
}

export function Card({ variant = 'default', padding = 'md', className = '', children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={[
        'rounded-[14px]',
        variants[variant],
        paddings[padding],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div
      className={['flex items-center gap-2 mb-4', className].join(' ')}
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#60A5FA',
        opacity: 0.85,
      }}
    >
      {children}
    </div>
  )
}

export function CardRow({ label, value, mono = false, className = '' }: {
  label: string, value: React.ReactNode, mono?: boolean, className?: string
}) {
  return (
    <div className={['flex items-center justify-between py-2.5 border-b border-[rgba(37,99,235,0.1)] last:border-0', className].join(' ')}>
      <span style={{ fontSize: 13, color: '#64748B', fontFamily: 'Inter, sans-serif' }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 600, color: '#F4F4F8',
        fontFamily: mono ? 'IBM Plex Mono, monospace' : 'Inter, sans-serif',
        letterSpacing: mono ? '0.01em' : undefined,
      }}>{value}</span>
    </div>
  )
}
