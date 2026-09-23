import React from 'react'
import { useNanStore } from '../../store/nanStore'
import { NanLogo } from '../ui/Logo'

// Lucide-style SVG icons inlined to avoid dependency issues
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? '#60A5FA' : 'none'} stroke={active ? '#60A5FA' : '#64748B'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
function ShopIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#60A5FA' : '#64748B'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )
}
function AgentIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#60A5FA' : '#64748B'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  )
}
function ActivityIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#60A5FA' : '#64748B'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}
function WalletIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#60A5FA' : '#64748B'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M16 14h.01"/>
      <path d="M2 10h20"/>
    </svg>
  )
}
function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? '#60A5FA' : '#64748B'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: HomeIcon },
  { id: 'wallet',   label: 'Wallet',   Icon: WalletIcon },
  { id: 'shop',     label: 'Shop',     Icon: ShopIcon },
  { id: 'agent',    label: 'Agent',    Icon: AgentIcon },
  { id: 'activity', label: 'Activity', Icon: ActivityIcon },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeView, setActiveView } = useNanStore()

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#0A0A0F',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* ── Top bar ── */}
      <header style={{
        height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 18px',
        background: 'rgba(10,10,15,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(37,99,235,0.14)',
        flexShrink: 0,
        zIndex: 50,
      }}>
        <NanLogo size="sm" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="net-pill">Arc Testnet</div>
          <button
            onClick={() => setActiveView('settings')}
            style={{
              width: 32, height: 32, borderRadius: 9,
              background: activeView === 'settings' ? 'rgba(37,99,235,0.16)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${activeView === 'settings' ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.08)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.18s',
            }}
          >
            <SettingsIcon active={activeView === 'settings'} />
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '14px 14px 90px',
        scrollbarWidth: 'none',
        animation: 'nan-up 0.28s ease both',
      }}>
        {children}
      </main>

      {/* ── Bottom nav — Nan pill style ── */}
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 76, zIndex: 100,
        background: '#0A0A0F',
        backdropFilter: 'blur(32px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '6px 10px 10px',
      }}>
        {/* Pill wrapper */}
        <div style={{
          display: 'flex',
          maxWidth: 480, margin: '0 auto',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18, padding: 4, gap: 2,
        }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activeView === id || (id === 'wallet' && ['send', 'receive'].includes(activeView))
            const isSend = id === 'wallet'
            return (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                style={{
                  flex: isSend ? 1.2 : 1,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3,
                  padding: '7px 4px',
                  border: `1px solid ${isActive ? 'rgba(37,99,235,0.25)' : 'transparent'}`,
                  background: isActive
                    ? (isSend ? 'rgba(37,99,235,0.2)' : '#1a1a1a')
                    : 'transparent',
                  color: isActive ? '#f0f0f0' : '#64748B',
                  cursor: 'pointer', transition: 'all 0.18s',
                  borderRadius: 13,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.04em',
                }}
              >
                <div style={{ filter: isActive ? 'drop-shadow(0 0 5px rgba(37,99,235,0.6))' : 'none', transition: 'filter 0.2s' }}>
                  {id === 'wallet' ? <SendIcon /> : <Icon active={isActive} />}
                </div>
                <span style={{ color: isActive ? '#f0f0f0' : '#64748B', transition: 'color 0.18s' }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
