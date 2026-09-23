import React from 'react'

export function NanLogo({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg', className?: string }) {
  const sizes = { sm: { mark: 22, text: 16 }, md: { mark: 28, text: 20 }, lg: { mark: 36, text: 26 } }
  const s = sizes[size]
  return (
    <div className={`flex items-center gap-2.5 ${className}`} style={{ fontFamily: 'Inter, sans-serif' }}>
      <div
        style={{
          width: s.mark, height: s.mark,
          borderRadius: 7,
          background: '#2563EB',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.mark * 0.52, fontWeight: 800, color: '#fff',
          letterSpacing: '-0.04em', flexShrink: 0,
          boxShadow: '0 4px 14px rgba(37,99,235,0.45)',
        }}
      >N</div>
      <span style={{
        fontWeight: 800, fontSize: s.text,
        letterSpacing: '-0.02em', color: '#F4F4F8',
        lineHeight: 1,
      }}>Nan</span>
    </div>
  )
}

/** Inline wordmark — just text, no mark box */
export function NanWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={className} style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: '#F4F4F8', fontFamily: 'Inter, sans-serif' }}>
      Nan
    </span>
  )
}
