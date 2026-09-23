import React, { useState, useRef, useEffect } from 'react'
import {
  Bot, Send, Settings, Shield, Zap, Check, X, ShoppingBag,
  Star, ToggleLeft, ToggleRight
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Input } from '../ui/Input'
import { LoadingDots } from '../ui/Spinner'
import { useNanStore } from '../../store/nanStore'
import type { AgentMessage, AgentPermissions } from '../../store/nanStore'
import { PRODUCTS, CATEGORIES, Product } from '../../data/products'
import { formatUSDC, formatRelativeTime } from '../../utils/format'
import { nanChat, nanBackendConfigured } from '../../lib/nan'

type AgentTab = 'chat' | 'permissions' | 'history'

// Simulated agent responses
function simulateAgentResponse(
  userMessage: string,
  permissions: AgentPermissions,
  dailyUsed: number
): Omit<AgentMessage, 'id' | 'timestamp'> {
  const msg = userMessage.toLowerCase()
  const dailyRemaining = permissions.dailyLimit - dailyUsed

  // Extract price from message
  const priceMatch = msg.match(/under\s+(\d+)|less than\s+(\d+)|max\s+(\d+)|budget.*?(\d+)/)
  const maxPrice = priceMatch ? parseInt(priceMatch[1] || priceMatch[2] || priceMatch[3] || priceMatch[4]) : null

  // Find relevant products
  const keywords = ['keyboard', 'headphone', 'laptop', 'stand', 'lamp', 'backpack', 'wallet', 'cable', 'hub', 'charger', 'notebook', 'template', 'font', 'icon']
  const matchedKeyword = keywords.find((k) => msg.includes(k))
  const categoryKeywords: Record<string, string> = {
    tech: 'tech', digital: 'digital', home: 'home', fashion: 'fashion',
    clothes: 'fashion', template: 'digital', design: 'digital',
  }
  const matchedCategory = Object.keys(categoryKeywords).find((k) => msg.includes(k))

  let candidateProducts = PRODUCTS.filter((p) => {
    if (!permissions.allowedCategories.includes(p.category)) return false
    if (maxPrice !== null && p.price > maxPrice) return false
    if (p.price > permissions.perTxLimit) return false
    if (!p.inStock) return false
    if (matchedKeyword && p.name.toLowerCase().includes(matchedKeyword)) return true
    if (matchedCategory && p.category === categoryKeywords[matchedCategory]) return true
    return true
  })

  if (matchedKeyword) {
    candidateProducts = candidateProducts.filter((p) => p.name.toLowerCase().includes(matchedKeyword)).concat(candidateProducts.filter((p) => !p.name.toLowerCase().includes(matchedKeyword)))
  }
  candidateProducts = candidateProducts.slice(0, 3)

  if (candidateProducts.length === 0) {
    if (dailyRemaining <= 0) {
      return {
        role: 'agent',
        content: `I can't make purchases right now — your daily spending limit of ${permissions.dailyLimit} USDC has been reached. Your limit resets tomorrow.`,
        action: 'info',
      }
    }
    return {
      role: 'agent',
      content: `I couldn't find products matching your request within your permissions (max ${formatUSDC(permissions.perTxLimit)} USDC per transaction, categories: ${permissions.allowedCategories.join(', ')}). Try broadening your search or adjusting your limits.`,
      action: 'info',
    }
  }

  const topProduct = candidateProducts[0]
  const canAutoPurchase = !permissions.requireApproval && topProduct.price <= permissions.autoApproveUnder

  if (msg.includes('buy') || msg.includes('purchase') || msg.includes('get me') || msg.includes('order')) {
    if (topProduct.price > dailyRemaining) {
      return {
        role: 'agent',
        content: `I found ${topProduct.name} for ${topProduct.price} USDC, but you only have ${formatUSDC(dailyRemaining)} USDC remaining in your daily limit. Adjust your limit in Settings to proceed.`,
        products: [topProduct],
        action: 'info',
      }
    }
    return {
      role: 'agent',
      content: canAutoPurchase
        ? `Purchasing ${topProduct.name} from ${topProduct.merchant} for ${topProduct.price} USDC — this is within your auto-approve limit.`
        : `I'd like to purchase ${topProduct.name} from ${topProduct.merchant} for ${topProduct.price} USDC. Do you want me to proceed?`,
      products: [topProduct],
      action: 'purchase_request',
      purchaseProductId: topProduct.id,
      purchaseAmount: topProduct.price,
    }
  }

  if (msg.includes('find') || msg.includes('search') || msg.includes('show') || msg.includes('look')) {
    return {
      role: 'agent',
      content: `I found ${candidateProducts.length} option${candidateProducts.length > 1 ? 's' : ''} within your budget and permissions:`,
      products: candidateProducts,
      action: 'search',
    }
  }

  // General question
  return {
    role: 'agent',
    content: `Here are some products I can help you with, based on your current limits (max ${formatUSDC(permissions.perTxLimit)} USDC per transaction):`,
    products: candidateProducts.slice(0, 3),
    action: 'search',
  }
}

export function AgentPage() {
  const [activeTab, setActiveTab] = useState<AgentTab>('chat')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 lg:pb-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#122d45] flex items-center justify-center flex-shrink-0">
          <Bot size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#122d45]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Shopping Agent
          </h1>
          <AgentStatusLine />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#f5f5f8] rounded-xl p-1 mb-5">
        {([['chat', 'Chat'], ['permissions', 'Permissions'], ['history', 'History']] as [AgentTab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 h-8 text-sm font-semibold rounded-lg transition-all ${
              activeTab === id
                ? 'bg-white text-[#122d45] shadow-sm'
                : 'text-[#6b6580] hover:text-[#334155]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'chat' && <AgentChat />}
      {activeTab === 'permissions' && <AgentPermissions />}
      {activeTab === 'history' && <AgentHistory />}
    </div>
  )
}

function AgentStatusLine() {
  const { agentPermissions, agentDailyUsed } = useNanStore()
  const remaining = agentPermissions.dailyLimit - agentDailyUsed
  if (!agentPermissions.enabled) {
    return <div className="text-xs text-[#ba2b4c] font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ba2b4c]" />Disabled</div>
  }
  return (
    <div className="text-xs text-[#1a8047] font-medium flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-[#1a8047]" />
      Active · {formatUSDC(remaining)} USDC remaining today
    </div>
  )
}

function AgentChat() {
  const { agentMessages, addAgentMessage, agentPermissions, agentDailyUsed, approveAgentPurchase, rejectAgentPurchase, clearAgentMessages, nanAuth } = useNanStore()
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages, isTyping])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    addAgentMessage({ role: 'user', content: text })
    setIsTyping(true)

    try {
      // Use Nan's real AI chat endpoint when backend is configured + user is signed in
      if (nanBackendConfigured() && nanAuth) {
        const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> = agentMessages
          .filter((m) => m.role === 'user' || m.role === 'agent')
          .slice(-8)
          .map((m) => ({ role: (m.role === 'agent' ? 'assistant' : 'user'), content: m.content }))
        apiMessages.push({ role: 'user', content: text })

        const result = await nanChat({
          messages: apiMessages,
          usdcBal: String(agentPermissions.dailyLimit),
          userAddress: nanAuth.walletAddress,
          sessionToken: nanAuth.sessionToken,
        })
        setIsTyping(false)
        addAgentMessage({ role: 'agent', content: result.reply, action: 'info' })
        return
      }
    } catch {
      // fall through to local simulation on error
    }

    // Local simulation fallback (demo mode / no backend)
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600))
    setIsTyping(false)
    const response = simulateAgentResponse(text, agentPermissions, agentDailyUsed)
    addAgentMessage(response)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const QUICK_PROMPTS = [
    'Find me a wireless keyboard under 25 USDC',
    'Show me digital downloads under 15 USDC',
    'Buy the cheapest laptop stand',
    'What can you buy for me today?',
  ]

  return (
    <div className="flex flex-col h-[520px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-3 pr-1">
        {agentMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onApprove={approveAgentPurchase}
            onReject={rejectAgentPurchase}
          />
        ))}
        {isTyping && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-full bg-[#f5f5f8] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot size={13} className="text-[#122d45]" />
            </div>
            <div className="bg-white border border-[rgba(18,45,69,0.1)] rounded-2xl rounded-tl-sm px-4 py-3">
              <LoadingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts (shown if few messages) */}
      {agentMessages.length <= 2 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => { setInput(p); }}
              className="text-xs font-medium px-3 py-1.5 bg-[#f5f5f8] hover:bg-[#eeeef4] text-[#334155] rounded-full transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            placeholder="Ask your agent to find or buy something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          onClick={() => { void sendMessage() }}
          disabled={!input.trim() || isTyping}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#122d45] text-white hover:bg-[#1a3f5e] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
        >
          <Send size={16} />
        </button>
        <button
          onClick={clearAgentMessages}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#f5f5f8] hover:bg-[#eeeef4] text-[#6b6580] transition-colors flex-shrink-0"
          title="Clear conversation"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function MessageBubble({
  msg,
  onApprove,
  onReject,
}: {
  msg: AgentMessage
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#122d45] text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[78%]">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-[#f5f5f8] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot size={13} className="text-[#122d45]" />
      </div>
      <div className="flex-1 max-w-[90%] space-y-2">
        <div className="bg-white border border-[rgba(18,45,69,0.1)] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-[#122d45]">
          {msg.content}
        </div>
        {/* Product results */}
        {msg.products && msg.products.length > 0 && (
          <div className="space-y-2">
            {msg.products.map((product) => (
              <ProductPill key={product.id} product={product} />
            ))}
          </div>
        )}
        {/* Purchase approval */}
        {msg.action === 'purchase_request' && msg.approved === undefined && (
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(msg.id)}
              className="flex-1 h-8 bg-[#122d45] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 hover:bg-[#1a3f5e] transition-colors"
            >
              <Check size={13} />
              Approve purchase
            </button>
            <button
              onClick={() => onReject(msg.id)}
              className="flex-1 h-8 bg-[#f5f5f8] text-[#334155] text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 hover:bg-[#eeeef4] transition-colors"
            >
              <X size={13} />
              Decline
            </button>
          </div>
        )}
        {msg.action === 'purchase_request' && msg.approved === true && (
          <div className="flex items-center gap-1.5 text-xs text-[#1a8047] font-semibold">
            <Check size={13} />
            Purchase approved and recorded
          </div>
        )}
        {msg.action === 'purchase_request' && msg.approved === false && (
          <div className="flex items-center gap-1.5 text-xs text-[#6b6580] font-medium">
            <X size={13} />
            Purchase declined
          </div>
        )}
        <div className="text-[10px] text-[#8a849c]">{formatRelativeTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

function ProductPill({ product }: { product: Product }) {
  return (
    <div className="bg-white rounded-xl border border-[rgba(18,45,69,0.1)] p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#f5f5f8] flex-shrink-0">
        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-[#122d45] truncate">{product.name}</div>
        <div className="text-xs text-[#6b6580] flex items-center gap-1">
          {product.merchant}
          <span>·</span>
          <Star size={10} className="text-[#f59e0b] fill-[#f59e0b]" />
          <span className="tabular-nums">{product.rating}</span>
        </div>
      </div>
      <div className="text-sm font-bold text-[#122d45] tabular-nums flex-shrink-0">
        {product.price} <span className="text-xs font-semibold text-[#6b6580]">USDC</span>
      </div>
    </div>
  )
}

function AgentPermissions() {
  const { agentPermissions, setAgentPermissions } = useNanStore()
  const [daily, setDaily] = useState(agentPermissions.dailyLimit.toString())
  const [perTx, setPerTx] = useState(agentPermissions.perTxLimit.toString())
  const [autoApprove, setAutoApprove] = useState(agentPermissions.autoApproveUnder.toString())
  const [saved, setSaved] = useState(false)

  const categories = CATEGORIES.filter((c) => c.id !== 'all')

  const handleSave = () => {
    setAgentPermissions({
      dailyLimit: Math.max(0, parseFloat(daily) || 0),
      perTxLimit: Math.max(0, parseFloat(perTx) || 0),
      autoApproveUnder: Math.max(0, parseFloat(autoApprove) || 0),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleCategory = (id: string) => {
    const cats = agentPermissions.allowedCategories
    if (cats.includes(id)) {
      setAgentPermissions({ allowedCategories: cats.filter((c) => c !== id) })
    } else {
      setAgentPermissions({ allowedCategories: [...cats, id] })
    }
  }

  return (
    <div className="space-y-4">
      {/* Enable/disable */}
      <Card padding="md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f5f5f8] flex items-center justify-center">
              <Zap size={16} className="text-[#122d45]" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#122d45]">Agent enabled</div>
              <div className="text-xs text-[#6b6580]">Allow agent to make purchases</div>
            </div>
          </div>
          <button onClick={() => setAgentPermissions({ enabled: !agentPermissions.enabled })}>
            {agentPermissions.enabled
              ? <ToggleRight size={28} className="text-[#122d45]" />
              : <ToggleLeft size={28} className="text-[#8a849c]" />
            }
          </button>
        </div>
      </Card>

      {/* Spending limits */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-[#1a6fd4]" />
          <span className="text-sm font-bold text-[#122d45]">Spending limits</span>
        </div>
        <div className="space-y-3">
          <Input
            label="Daily limit (USDC)"
            type="number"
            min="0"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            suffix={<span className="text-xs font-bold text-[#6b6580]">USDC/day</span>}
          />
          <Input
            label="Per-transaction limit (USDC)"
            type="number"
            min="0"
            value={perTx}
            onChange={(e) => setPerTx(e.target.value)}
            suffix={<span className="text-xs font-bold text-[#6b6580]">USDC</span>}
          />
          <Input
            label="Auto-approve under (USDC)"
            type="number"
            min="0"
            value={autoApprove}
            onChange={(e) => setAutoApprove(e.target.value)}
            suffix={<span className="text-xs font-bold text-[#6b6580]">USDC</span>}
          />
          <p className="text-xs text-[#6b6580]">
            Purchases below the auto-approve threshold will be made without asking for confirmation.
          </p>
        </div>
      </Card>

      {/* Require approval */}
      <Card padding="md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#122d45]">Always require approval</div>
            <div className="text-xs text-[#6b6580]">Agent must ask before every purchase</div>
          </div>
          <button onClick={() => setAgentPermissions({ requireApproval: !agentPermissions.requireApproval })}>
            {agentPermissions.requireApproval
              ? <ToggleRight size={28} className="text-[#122d45]" />
              : <ToggleLeft size={28} className="text-[#8a849c]" />
            }
          </button>
        </div>
      </Card>

      {/* Allowed categories */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag size={16} className="text-[#6d28d9]" />
          <span className="text-sm font-bold text-[#122d45]">Allowed categories</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const allowed = agentPermissions.allowedCategories.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`h-8 px-3 rounded-full text-xs font-semibold transition-all ${
                  allowed
                    ? 'bg-[#122d45] text-white'
                    : 'bg-[#f5f5f8] text-[#334155] hover:bg-[#eeeef4]'
                }`}
              >
                {allowed && <Check size={11} className="inline mr-1" />}
                {cat.label}
              </button>
            )
          })}
        </div>
      </Card>

      <Button fullWidth onClick={handleSave} icon={saved ? <Check size={16} /> : <Settings size={16} />}>
        {saved ? 'Saved' : 'Save permissions'}
      </Button>
    </div>
  )
}

function AgentHistory() {
  const { activity } = useNanStore()
  const agentActivity = activity.filter((a) => a.agentInitiated)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#122d45]">Agent activity log</p>
        <Badge variant="blue" size="sm">{agentActivity.length} actions</Badge>
      </div>
      {agentActivity.length === 0 ? (
        <div className="text-center py-12">
          <Bot size={32} className="text-[#8a849c] mx-auto mb-3" />
          <p className="text-sm text-[#6b6580]">No agent activity yet</p>
          <p className="text-xs text-[#8a849c] mt-1">Your agent's purchases will appear here</p>
        </div>
      ) : (
        agentActivity.map((item) => (
          <Card key={item.id} padding="md">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#ede9fe] flex items-center justify-center flex-shrink-0">
                <Bot size={15} className="text-[#6d28d9]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#122d45] truncate">{item.description}</div>
                <div className="text-xs text-[#6b6580] mt-0.5">
                  {item.counterparty} · {formatRelativeTime(item.timestamp)}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant={item.status === 'confirmed' ? 'success' : item.status === 'pending' ? 'warning' : 'danger'} size="sm">
                    {item.status}
                  </Badge>
                </div>
              </div>
              <div className="text-sm font-bold text-[#122d45] tabular-nums flex-shrink-0">
                −{formatUSDC(item.amount)} USDC
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
