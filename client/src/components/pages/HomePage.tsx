import React from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { useNanStore, ActivityItem } from '../../store/nanStore'
import { Badge } from '../ui/Badge'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

const NAN_TEXT = '#F4F4F8'
const NAN_TEXT_2 = '#9AA0B0'
const NAN_TEXT_3 = '#64748B'
const NAN_BLUE = '#2563EB'
const NAN_BLUE_LIGHT = '#60A5FA'
const NAN_BORDER = 'rgba(37,99,235,0.16)'
const MONO = 'IBM Plex Mono, monospace'
const SANS = 'Inter, sans-serif'
const ARC_TESTNET_ID = 5042002

function QuickAction({ icon, label, primary, onClick }: { icon: string, label: string, primary?: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: primary
          ? 'linear-gradient(135deg,rgba(37,99,235,0.22),rgba(37,99,235,0.12))'
          : 'rgba(37,99,235,0.06)',
        border: `1px solid ${primary ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.18)'}`,
        borderRadius: 16, padding: '14px 8px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        cursor: 'pointer', transition: 'all 0.2s',
        boxShadow: primary ? '0 4px 20px rgba(37,99,235,0.18)' : 'none',
        fontFamily: SANS,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = primary ? 'rgba(37,99,235,0.55)' : 'rgba(37,99,235,0.36)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = primary ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.18)'
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: primary ? '#111111' : 'rgba(37,99,235,0.14)',
        border: `1px solid ${primary ? 'none' : 'rgba(37,99,235,0.22)'}`,
        boxShadow: primary ? '0 4px 12px rgba(37,99,235,0.4)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, lineHeight: 1,
      }}>{icon}</div>
      <span style={{ fontSize: 11, fontWeight: 700, color: primary ? '#f0f0f0' : NAN_TEXT_2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </button>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const sign = item.sign === '+' ? '+' : '-'
  const isIn = item.sign === '+'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 12px', borderRadius: 14, marginBottom: 6,
      background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(37,99,235,0.1)`,
      cursor: 'pointer', transition: 'all 0.18s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(37,99,235,0.06)'
        e.currentTarget.style.borderColor = 'rgba(37,99,235,0.22)'
        e.currentTarget.style.transform = 'translateX(2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
        e.currentTarget.style.borderColor = 'rgba(37,99,235,0.1)'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        background: isIn ? 'rgba(34,197,94,0.12)' : 'rgba(37,99,235,0.1)',
        border: `1px solid ${isIn ? 'rgba(34,197,94,0.2)' : 'rgba(37,99,235,0.2)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {item.agentInitiated ? '🤖' : isIn ? '↓' : '↑'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: NAN_TEXT, fontFamily: SANS }}>{item.description}</div>
        <div style={{ fontSize: 12, color: NAN_TEXT_3, marginTop: 1, fontFamily: MONO }}>
          {item.counterparty && <span>{item.counterparty} · </span>}
          {new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <span style={{
        fontFamily: MONO, fontSize: 14, fontWeight: 600,
        color: isIn ? '#22C55E' : NAN_TEXT,
      }}>
        {sign}{item.amount} USDC
      </span>
    </div>
  )
}

export function HomePage() {
  const { address, isConnected } = useAccount()
  const { activity, agentPermissions, agentDailyUsed, setActiveView } = useNanStore()
  const usdcFact = getUsdc(ARC_TESTNET_ID)

  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const formattedBalance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
    : null

  const totalBalance = formattedBalance ? parseFloat(formattedBalance) : 0
  const agentBal = agentPermissions.dailyLimit
  const available = Math.max(0, totalBalance - agentBal)
  const dailyRemaining = Math.max(0, agentPermissions.dailyLimit - agentDailyUsed)
  const pct = agentPermissions.dailyLimit > 0 ? (agentDailyUsed / agentPermissions.dailyLimit) * 100 : 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const recent = activity.slice(0, 4)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 4, fontFamily: SANS }}>

      {/* Greeting */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: NAN_TEXT_3, fontWeight: 500, marginBottom: 2 }}>{greeting}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: NAN_TEXT, letterSpacing: '-0.5px' }}>
          {address ? address.slice(0, 6) + '...' + address.slice(-4) : 'Welcome to Nan'}
        </div>
      </div>

      {/* Balance card — Nan's exact style */}
      <div style={{
        background: 'linear-gradient(145deg,#1a1a1a 0%,#111111 50%,#1a1a1a 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: 20, marginBottom: 10,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Glow orb */}
        <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle,rgba(37,99,235,0.22),transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Total Balance</div>
        {isLoading ? (
          <div style={{ fontSize: 38, fontWeight: 700, color: '#f0f0f0', marginBottom: 4, letterSpacing: '-1.5px' }}>
            <span style={{ opacity: 0.3 }}>— USDC</span>
          </div>
        ) : (
          <div style={{ fontSize: 38, fontWeight: 700, color: '#f0f0f0', marginBottom: 4, letterSpacing: '-1.5px', fontFamily: MONO }}>
            {formattedBalance ?? '0.00'} <span style={{ fontSize: 18, color: NAN_BLUE_LIGHT }}>USDC</span>
          </div>
        )}
        {!isConnected && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 12, fontFamily: MONO }}>Connect wallet to see balance</div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[{ label: 'Available', val: `${available.toFixed(2)} USDC` }, { label: 'Agent', val: `${agentBal} USDC` }].map(({ label, val }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 100, padding: '4px 10px',
              fontFamily: MONO, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.65)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#111', boxShadow: '0 0 5px rgba(37,99,235,0.7)', flexShrink: 0 }} />
              <span style={{ color: NAN_TEXT_3 }}>{label}: </span>{val}
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <QuickAction icon="⬆️" label="Send" primary onClick={() => setActiveView('send')} />
        <QuickAction icon="⬇️" label="Receive" onClick={() => setActiveView('receive')} />
        <QuickAction icon="🛍️" label="Shop" onClick={() => setActiveView('shop')} />
        <QuickAction icon="🤖" label="Agent" onClick={() => setActiveView('agent')} />
      </div>

      {/* Agent spending */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${NAN_BORDER}`,
        borderRadius: 14, padding: 16, marginBottom: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(37,99,235,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: NAN_BLUE_LIGHT, opacity: 0.85 }}>Agent Spending</div>
          <Badge variant="blue" dot>Active</Badge>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          {[
            { label: 'Daily limit', val: `${agentPermissions.dailyLimit} USDC` },
            { label: 'Used today', val: `${agentDailyUsed} USDC` },
            { label: 'Remaining', val: `${dailyRemaining} USDC` },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAN_TEXT, fontFamily: MONO }}>{val}</div>
              <div style={{ fontSize: 11, color: NAN_TEXT_3, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: 'rgba(37,99,235,0.12)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 80 ? '#ef4444' : NAN_BLUE, borderRadius: 2, transition: 'width 0.5s ease' }} />
        </div>
        <button
          onClick={() => setActiveView('agent')}
          style={{
            marginTop: 14, width: '100%', padding: '10px', borderRadius: 9,
            background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)',
            color: NAN_BLUE_LIGHT, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
            transition: 'all 0.2s',
          }}
        >Open Agent →</button>
      </div>

      {/* Recent activity */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${NAN_BORDER}`,
        borderRadius: 14, padding: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(37,99,235,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: NAN_BLUE_LIGHT, opacity: 0.85 }}>Recent Activity</div>
          <button onClick={() => setActiveView('activity')} style={{ fontSize: 12, color: NAN_BLUE_LIGHT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO }}>View all →</button>
        </div>
        {recent.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: NAN_TEXT_3, fontSize: 13 }}>No activity yet</div>
        ) : (
          recent.map(item => <ActivityRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
