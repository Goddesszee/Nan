import React from 'react'
import { Wallet, Bot, Shield, HelpCircle, ExternalLink, ChevronRight, LogOut } from 'lucide-react'
import { useAccount, useDisconnect } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { useNanStore } from '../../store/nanStore'
import { formatAddress } from '../../utils/format'
import { requireChain } from '@/onchain-facts'

const ARC_TESTNET_ID = 5042002

export function SettingsPage() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { agentPermissions, setOnboarding, setActiveView } = useNanStore()
  const chain = requireChain(ARC_TESTNET_ID)

  const handleReset = () => {
    if (window.confirm('Reset onboarding? This will take you back to the welcome screen.')) {
      setOnboarding({ completed: false, step: 0 })
      setActiveView('landing')
    }
  }

  const sections = [
    {
      title: 'Wallet',
      items: [
        {
          icon: <Wallet size={17} className="text-[#1a6fd4]" />,
          label: 'Connected wallet',
          value: isConnected ? formatAddress(address!) : 'Not connected',
          badge: isConnected ? <Badge variant="success" size="sm">Connected</Badge> : null,
          action: null,
        },
        {
          icon: <Shield size={17} className="text-[#6d28d9]" />,
          label: 'Network',
          value: chain.name,
          badge: <Badge variant="blue" size="sm">Testnet</Badge>,
          action: null,
        },
      ],
    },
    {
      title: 'Agent',
      items: [
        {
          icon: <Bot size={17} className="text-[#122d45]" />,
          label: 'Agent status',
          value: agentPermissions.enabled ? 'Active' : 'Disabled',
          badge: agentPermissions.enabled ? <Badge variant="success" size="sm">On</Badge> : <Badge variant="default" size="sm">Off</Badge>,
          action: () => setActiveView('agent'),
        },
        {
          icon: <Shield size={17} className="text-[#1a8047]" />,
          label: 'Daily limit',
          value: `${agentPermissions.dailyLimit} USDC/day`,
          badge: null,
          action: () => setActiveView('agent'),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: <HelpCircle size={17} className="text-[#6b6580]" />,
          label: 'Arc documentation',
          value: 'docs.arc.io',
          badge: null,
          action: () => window.open('https://docs.arc.io', '_blank'),
          external: true,
        },
        {
          icon: <ExternalLink size={17} className="text-[#6b6580]" />,
          label: 'Arc Testnet explorer',
          value: chain.explorerBase,
          badge: null,
          action: () => window.open(chain.explorerBase, '_blank'),
          external: true,
        },
      ],
    },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 lg:pb-8 space-y-6">
      <h1 className="text-xl font-bold text-[#122d45]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Settings
      </h1>

      {/* Wallet connection block */}
      {!isConnected && (
        <Card padding="md">
          <p className="text-sm text-[#6b6580] mb-3">Connect a wallet to use Nan.</p>
          <ConnectKitButton />
        </Card>
      )}

      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-xs font-bold text-[#6b6580] uppercase tracking-wider mb-2 px-1">{section.title}</p>
          <Card padding="none">
            {section.items.map((item, idx) => (
              <button
                key={idx}
                onClick={item.action ?? undefined}
                disabled={!item.action}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  idx > 0 ? 'border-t border-[rgba(18,45,69,0.05)]' : ''
                } ${item.action ? 'hover:bg-[#f9f9fc] cursor-pointer' : 'cursor-default'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-[#f5f5f8] flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#122d45]">{item.label}</div>
                  <div className="text-xs text-[#6b6580] truncate">{item.value}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.badge}
                  {item.action && <ChevronRight size={15} className="text-[#8a849c]" />}
                </div>
              </button>
            ))}
          </Card>
        </div>
      ))}

      {/* Danger zone */}
      <div>
        <p className="text-xs font-bold text-[#6b6580] uppercase tracking-wider mb-2 px-1">Account</p>
        <Card padding="none">
          {isConnected && (
            <button
              onClick={() => disconnect()}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#fee2e2] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-[#fee2e2] flex items-center justify-center flex-shrink-0">
                <LogOut size={17} className="text-[#ba2b4c]" />
              </div>
              <span className="text-sm font-semibold text-[#ba2b4c]">Disconnect wallet</span>
            </button>
          )}
          <button
            onClick={handleReset}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#f9f9fc] transition-colors border-t border-[rgba(18,45,69,0.05)] text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[#f5f5f8] flex items-center justify-center flex-shrink-0">
              <LogOut size={17} className="text-[#6b6580]" />
            </div>
            <span className="text-sm font-semibold text-[#334155]">Reset onboarding</span>
          </button>
        </Card>
      </div>

      <p className="text-center text-xs text-[#8a849c]">
        Nan · Testnet demo · Powered by Arc
      </p>
    </div>
  )
}
