import React from 'react'

export function Spinner({ size = 20, color = '#60A5FA' }: { size?: number, color?: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid rgba(37,99,235,0.2)`,
        borderTopColor: color,
        animation: 'nan-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

export function LoadingDots({ color = '#60A5FA' }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: '50%', background: color,
            display: 'inline-block', opacity: 0.7,
            animation: `nan-spin 1.2s ease-in-out ${i * 0.2}s infinite alternate`,
          }}
        />
      ))}
    </span>
  )
}

export function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: '#0A0A0F', zIndex: 999,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 11,
        background: '#2563EB',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 800, color: '#fff',
        boxShadow: '0 8px 24px rgba(37,99,235,0.45)',
        marginBottom: 4,
      }}>N</div>
      <Spinner size={24} />
      <p style={{ fontSize: 13, color: '#64748B', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' }}>
        loading
      </p>
    </div>
  )
}
