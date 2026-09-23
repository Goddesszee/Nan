import React, { useState } from 'react'
import { useNanStore } from '../../store/nanStore'
import { NanLogo } from '../ui/Logo'

const NAN_BLUE = '#2563EB'
const NAN_BLUE_LIGHT = '#60A5FA'
const NAN_TEXT = '#F4F4F8'
const NAN_TEXT_2 = '#9AA0B0'
const NAN_TEXT_3 = '#64748B'
const NAN_BG = '#0A0A0F'
const NAN_SURFACE = '#111118'
const NAN_BORDER = 'rgba(37,99,235,0.16)'
const MONO = 'IBM Plex Mono, monospace'
const SANS = 'Inter, sans-serif'

function Btn({ primary, children, onClick }: { primary?: boolean, children: React.ReactNode, onClick?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: SANS, fontWeight: 600, fontSize: 14,
        padding: primary ? '14px 28px' : '13px 22px',
        borderRadius: 9, cursor: 'pointer',
        border: primary ? 'none' : `1px solid ${NAN_BORDER}`,
        background: primary
          ? (hov ? '#1D4ED8' : NAN_BLUE)
          : (hov ? 'rgba(37,99,235,0.06)' : 'transparent'),
        color: primary ? '#fff' : NAN_TEXT,
        boxShadow: primary && hov ? '0 8px 24px rgba(37,99,235,0.38)' : undefined,
        transition: 'all 0.2s ease',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        letterSpacing: '-0.01em',
      }}
    >{children}</button>
  )
}

function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 12, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: NAN_BLUE_LIGHT,
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
      ...style,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: NAN_BLUE, boxShadow: `0 0 8px ${NAN_BLUE}`, display: 'inline-block', flexShrink: 0 }} />
      {children}
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: string, title: string, desc: string }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? '#191922' : NAN_SURFACE,
        border: `1px solid ${NAN_BORDER}`,
        borderRadius: 14, padding: 32,
        transition: 'background 0.25s ease',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(37,99,235,0.12)',
        border: '1px solid rgba(37,99,235,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, marginBottom: 20,
      }}>{icon}</div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: NAN_TEXT, marginBottom: 8, letterSpacing: '-0.01em', fontFamily: SANS }}>{title}</h3>
      <p style={{ fontSize: 14, color: NAN_TEXT_2, lineHeight: 1.6, fontFamily: SANS }}>{desc}</p>
    </div>
  )
}

function Step({ n, title, desc }: { n: number, title: string, desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, fontSize: 13, fontWeight: 500, color: NAN_BLUE_LIGHT,
        marginTop: 2,
      }}>{String(n).padStart(2, '0')}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAN_TEXT, marginBottom: 4, fontFamily: SANS }}>{title}</div>
        <div style={{ fontSize: 13.5, color: NAN_TEXT_2, lineHeight: 1.55, fontFamily: SANS }}>{desc}</div>
      </div>
    </div>
  )
}

export function LandingPage() {
  const { setActiveView } = useNanStore()
  const launch = () => setActiveView('onboarding')

  return (
    <div style={{ background: NAN_BG, color: NAN_TEXT, fontFamily: SANS, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(10,10,15,0.72)', backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${NAN_BORDER}`,
      }}>
        <nav style={{
          maxWidth: 1180, margin: '0 auto', padding: '18px 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <NanLogo />
          <div style={{ display: 'flex', gap: 36, fontSize: 14, fontWeight: 500, color: NAN_TEXT_2 }}>
            {['Send & Receive', 'Shop', 'AI Agent', 'Merchants'].map(l => (
              <a key={l} href="#" style={{ color: NAN_TEXT_2, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = NAN_TEXT)}
                onMouseLeave={e => (e.currentTarget.style.color = NAN_TEXT_2)}>{l}</a>
            ))}
          </div>
          <Btn primary onClick={launch}>Launch Nan →</Btn>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{
        paddingTop: 200, paddingBottom: 140, paddingLeft: 32, paddingRight: 32,
        background: 'radial-gradient(ellipse 900px 500px at 22% -10%, rgba(37,99,235,0.18), transparent 60%), radial-gradient(ellipse 700px 500px at 85% 15%, rgba(37,99,235,0.09), transparent 60%)',
        maxWidth: 1180, margin: '0 auto',
      }}>
        <Eyebrow>Powered by Arc · Circle USDC</Eyebrow>
        <h1 style={{
          fontSize: 'clamp(40px, 7vw, 64px)', fontWeight: 800,
          letterSpacing: '-0.03em', lineHeight: 1.06,
          marginBottom: 24, maxWidth: 720,
        }}>
          The{' '}
          <span style={{
            background: 'linear-gradient(120deg, #2563EB, #93C5FD 60%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Intelligent</span>{' '}
          Payment Layer
        </h1>
        <p style={{ fontSize: 18, color: NAN_TEXT_2, lineHeight: 1.6, maxWidth: 520, marginBottom: 38 }}>
          Send, receive, shop and spend USDC with a built-in AI agent — all on Arc Testnet. Your money, your rules.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 64 }}>
          <Btn primary onClick={launch}>Launch Nan →</Btn>
          <Btn>See how it works</Btn>
        </div>

        {/* Trust row */}
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', fontFamily: MONO, fontSize: 12, color: NAN_TEXT_3, letterSpacing: '0.04em' }}>
          {['Circle USDC', 'Arc Testnet', 'CCTP V2 Bridge', 'Circle Gateway', 'x402 Nanopayments'].map(t => (
            <span key={t}>{t}</span>
          ))}
        </div>

        {/* Dashboard preview card */}
        <div style={{
          marginTop: 72, maxWidth: 540,
          background: 'linear-gradient(145deg,#1a1a1a 0%,#111111 50%,#1a1a1a 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18, padding: 24,
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.22), transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Total Balance</div>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-2px', color: '#f0f0f0', marginBottom: 16 }}>120.00 <span style={{ fontSize: 22, color: NAN_BLUE_LIGHT }}>USDC</span></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[{ label: 'Available', val: '100.00 USDC' }, { label: 'Agent', val: '20.00 USDC' }].map(({ label, val }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 100, padding: '4px 12px', fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: MONO }}>
                <span style={{ color: NAN_TEXT_3 }}>{label}: </span>{val}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[{ label: 'Send', color: NAN_BLUE }, { label: 'Receive', color: 'rgba(37,99,235,0.1)' }, { label: 'Shop', color: 'rgba(37,99,235,0.1)' }].map(({ label, color }) => (
              <div key={label} style={{ background: color, border: `1px solid rgba(37,99,235,0.25)`, borderRadius: 10, padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: label === 'Send' ? '#fff' : NAN_TEXT_2 }}>{label}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: '100px 32px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ maxWidth: 640, marginBottom: 56 }}>
          <Eyebrow>Why Nan</Eyebrow>
          <h2 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, color: NAN_TEXT }}>
            Everything USDC.<br />One simple app.
          </h2>
          <p style={{ color: NAN_TEXT_2, fontSize: 16, marginTop: 16, lineHeight: 1.6 }}>
            Nan brings together wallets, payments, commerce, and AI-agent spending in one coherent experience.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 1, background: NAN_BORDER, border: `1px solid ${NAN_BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
          <FeatureCard icon="💸" title="Move Money" desc="Send and receive USDC instantly on Arc Testnet. Real wallet, real transactions." />
          <FeatureCard icon="🛍️" title="Shop with USDC" desc="Browse a marketplace of products and pay merchants directly from your Nan wallet." />
          <FeatureCard icon="🤖" title="AI Agent Shopping" desc="Your agent finds products, checks your spending limits, and asks before every purchase." />
          <FeatureCard icon="🌉" title="Bridge via CCTP" desc="Move USDC across chains with Circle's Cross-Chain Transfer Protocol." />
          <FeatureCard icon="⚡" title="Nanopayments" desc="Pay for APIs and services with sub-cent USDC micropayments via x402 protocol." />
          <FeatureCard icon="📊" title="Full Activity Log" desc="Every transaction, agent action, and merchant payment logged and searchable." />
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding: '100px 32px', maxWidth: 1180, margin: '0 auto', borderTop: `1px solid ${NAN_BORDER}` }}>
        <div style={{ maxWidth: 640, marginBottom: 56 }}>
          <Eyebrow>How it works</Eyebrow>
          <h2 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.025em', color: NAN_TEXT }}>Four steps to programmable money</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 32 }}>
          <Step n={1} title="Fund your wallet" desc="Connect and get test USDC. Nan uses Circle developer-controlled wallets on Arc Testnet." />
          <Step n={2} title="Set your rules" desc="Choose how much your AI agent can spend per transaction and per day." />
          <Step n={3} title="Ask your agent" desc="Tell it what you want. It finds products, confirms budget, and asks for approval." />
          <Step n={4} title="Stay in control" desc="Every agent action is logged. Approve, reject, or adjust limits anytime." />
        </div>
      </section>

      {/* ── Agent demo ── */}
      <section style={{ padding: '100px 32px', maxWidth: 1180, margin: '0 auto', borderTop: `1px solid ${NAN_BORDER}` }}>
        <div style={{ maxWidth: 640, marginBottom: 56 }}>
          <Eyebrow>AI Agent</Eyebrow>
          <h2 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.025em', color: NAN_TEXT }}>AI that can act, not just answer.</h2>
          <p style={{ color: NAN_TEXT_2, fontSize: 16, marginTop: 16, lineHeight: 1.6 }}>
            Your Nan agent discovers products, checks your spending rules, and purchases within the limits you set.
          </p>
        </div>
        <div style={{ maxWidth: 480, background: NAN_SURFACE, border: `1px solid ${NAN_BORDER}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { role: 'user', msg: 'Find me a wireless keyboard under 25 USDC.' },
            { role: 'agent', msg: 'Found 3 options within your budget. Topping the list: Wireless Mechanical Keyboard — 24 USDC at TechFlow. Your daily limit has 12 USDC remaining. Shall I purchase?' },
            { role: 'user', msg: 'Yes, go ahead.' },
            { role: 'agent', msg: '✓ Purchased. 24 USDC charged. Transaction confirmed on Arc Testnet.' },
          ].map(({ role, msg }, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '78%', padding: '10px 14px', borderRadius: role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: role === 'user' ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${role === 'user' ? 'rgba(37,99,235,0.32)' : 'rgba(255,255,255,0.08)'}`,
                fontSize: 13.5, color: NAN_TEXT, lineHeight: 1.5, fontFamily: SANS,
              }}>{msg}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '80px 32px 120px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(37,99,235,0.16), rgba(37,99,235,0.05))',
          border: `1px solid ${NAN_BORDER}`, borderRadius: 24,
          padding: 'clamp(48px,6vw,80px) 60px', textAlign: 'center',
        }}>
          <Eyebrow style={{ justifyContent: 'center' }}>Get started</Eyebrow>
          <h2 style={{ fontSize: 'clamp(28px,5vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', color: NAN_TEXT, marginBottom: 16, marginTop: 8 }}>
            Put your money to work.
          </h2>
          <p style={{ color: NAN_TEXT_2, marginBottom: 36, fontSize: 16, maxWidth: 480, margin: '0 auto 36px' }}>
            Nan gives you a USDC wallet, an AI shopping agent, and a merchant marketplace — all in one app.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Btn primary onClick={launch}>Launch Nan →</Btn>
            <Btn>Read the docs</Btn>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${NAN_BORDER}`, padding: '40px 32px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <NanLogo size="sm" />
          <div style={{ display: 'flex', gap: 24, fontFamily: MONO, fontSize: 11, color: NAN_TEXT_3, letterSpacing: '0.04em' }}>
            <span>Powered by Arc</span>
            <span>·</span>
            <span>Circle USDC</span>
            <span>·</span>
            <span>Testnet</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
