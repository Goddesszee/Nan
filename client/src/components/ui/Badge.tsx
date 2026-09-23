import React from 'react'

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'blue' | 'mono'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  dot?: boolean
  size?: 'sm' | 'md'
}

const styles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'rgba(255,255,255,0.06)', color: '#9AA0B0', border: '1px solid rgba(255,255,255,0.1)' },
  success: { background: 'rgba(34,197,94,0.12)',   color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' },
  danger:  { background: 'rgba(239,68,68,0.12)',   color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' },
  warning: { background: 'rgba(245,158,11,0.12)',  color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' },
  blue:    { background: 'rgba(37,99,235,0.12)',   color: '#60A5FA', border: '1px solid rgba(37,99,235,0.28)' },
  mono:    { background: 'rgba(37,99,235,0.08)',   color: '#60A5FA', border: '1px solid rgba(37,99,235,0.2)', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.04em' },
}

const dotColors: Record<BadgeVariant, string> = {
  default: '#9AA0B0',
  success: '#22C55E',
  danger:  '#ef4444',
  warning: '#F59E0B',
  blue:    '#60A5FA',
  mono:    '#60A5FA',
}

export function Badge({ variant = 'default', children, dot, size = 'md' }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: size === 'sm' ? '2px 7px' : '3px 9px', borderRadius: 100,
        fontSize: size === 'sm' ? 11 : 12, fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap',
        ...styles[variant],
      }}
    >
      {dot && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: dotColors[variant], flexShrink: 0,
          boxShadow: `0 0 5px ${dotColors[variant]}`,
        }} />
      )}
      {children}
    </span>
  )
}
