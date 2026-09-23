import React, { useState, useEffect } from 'react'
import {
  Copy, QrCode, ArrowUpRight, ArrowDownLeft, Check, ExternalLink,
  AlertCircle, X, ChevronRight, Wallet
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useAccount } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { useNanStore, ActivityItem } from '../../store/nanStore'
import { formatAddress, formatUSDC, parseOnchainError } from '../../utils/format'
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { TokenUSDC } from '@web3icons/react'
import { getWallet, sendUsdc, nanBackendConfigured } from '../../lib/nan'

const ARC_TESTNET_ID = 5042002

/** Fetches USDC balance from Nan backend (Circle dev-controlled wallet) */
function useNanBalance(address: string, sessionToken: string) {
  const [balance, setBalance] = useState<string | null>(null)
  const [rawNum, setRawNum] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const fetch = React.useCallback(async () => {
    if (!address || !sessionToken || !nanBackendConfigured()) return
    setIsLoading(true)
    try {
      // getWallet needs the email — derive it from the email in Zustand via
      // a direct state read (this hook is always rendered inside a component
      // that already has access to nanAuth via the same store).
      // We accept a placeholder email here; callers pass the real value.
      const data = await getWallet(address, sessionToken)
      const amount = parseFloat(data.usdc)
      setRawNum(amount)
      setBalance(amount.toFixed(2))
    } catch {
      // silent — balance will just stay null
    } finally {
      setIsLoading(false)
    }
  }, [address, sessionToken])

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void fetch() }, [fetch])

  return { balance, rawNum, isLoading, refetch: fetch }
}

type WalletSubView = 'main' | 'send' | 'send_confirm' | 'send_success' | 'receive'

export function WalletPage({ initialSubView = 'main' }: { initialSubView?: WalletSubView }) {
  const [subView, setSubView] = useState<WalletSubView>(initialSubView)
  const { nanAuth, agentPermissions, addActivity } = useNanStore()
  // Wagmi fallback — used only when no Nan session is active
  const { address: wagmiAddress, chainId } = useAccount()
  const [copied, setCopied] = useState(false)

  const chain = requireChain(ARC_TESTNET_ID)

  // Prefer Nan session wallet address over wagmi
  const address = nanAuth?.walletAddress || wagmiAddress
  const sessionToken = nanAuth?.sessionToken ?? ''

  const { balance, rawNum, isLoading, refetch } = useNanBalance(
    address ?? '',
    sessionToken,
  )

  const handleCopy = () => {
    if (!address) return
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  if (!nanAuth && !wagmiAddress) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-[#f5f5f8] flex items-center justify-center mx-auto mb-4">
          <Wallet size={28} className="text-[#8a849c]" />
        </div>
        <h2 className="text-xl font-bold text-[#122d45] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Not signed in
        </h2>
        <p className="text-sm text-[#6b6580] mb-6">Sign in to view your balance and make transactions.</p>
      </div>
    )
  }

  if (subView === 'send' || subView === 'send_confirm' || subView === 'send_success') {
    return (
      <SendFlow
        balance={rawNum}
        address={address!}
        chainId={chainId}
        sessionToken={sessionToken}
        walletId={nanAuth?.walletId ?? ''}
        onBack={() => setSubView('main')}
        onSuccess={() => { void refetch(); setSubView('main') }}
        addActivity={addActivity}
      />
    )
  }

  if (subView === 'receive') {
    return <ReceiveView address={address!} onBack={() => setSubView('main')} />
  }

  const agentReserved = agentPermissions.dailyLimit
  const available = Math.max(0, rawNum - agentReserved)

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-28 lg:pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#122d45]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Wallet
        </h1>
        <Badge variant="blue" size="sm">{chain.name}</Badge>
      </div>

      {/* Balance card */}
      <Card padding="lg">
        <div className="flex items-center gap-3 mb-4">
          <TokenUSDC variant="branded" size={32} />
          <div>
            <div className="text-xs font-bold text-[#6b6580] uppercase tracking-wider">Total Balance</div>
          </div>
        </div>
        {isLoading ? (
          <div className="h-12 w-48 bg-[#f5f5f8] rounded-xl animate-pulse mb-4" />
        ) : (
          <div className="flex items-baseline gap-2 mb-4">
            <span
              className="text-4xl font-bold text-[#122d45] tabular-nums"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.04em' }}
            >
              {balance ?? '0.00'}
            </span>
            <span className="text-lg font-semibold text-[#6b6580]">USDC</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-[#f9f9fc] rounded-xl p-3">
            <div className="text-xs text-[#6b6580] font-medium mb-1">Available</div>
            <div className="text-base font-bold text-[#122d45] tabular-nums">{formatUSDC(available)}</div>
            <div className="text-xs text-[#8a849c]">USDC</div>
          </div>
          <div className="bg-[#f9f9fc] rounded-xl p-3">
            <div className="text-xs text-[#6b6580] font-medium mb-1">Reserved for agent</div>
            <div className="text-base font-bold text-[#1a6fd4] tabular-nums">{formatUSDC(agentReserved)}</div>
            <div className="text-xs text-[#8a849c]">USDC daily limit</div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button fullWidth onClick={() => setSubView('send')} icon={<ArrowUpRight size={16} />}>
            Send
          </Button>
          <Button fullWidth variant="secondary" onClick={() => setSubView('receive')} icon={<ArrowDownLeft size={16} />}>
            Receive
          </Button>
        </div>
      </Card>

      {/* Wallet address */}
      <Card padding="md">
        <div className="text-xs font-bold text-[#6b6580] uppercase tracking-wider mb-3">Wallet address</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#f9f9fc] rounded-xl px-3 py-2.5">
            <div className="text-sm font-mono text-[#122d45] truncate">{address}</div>
          </div>
          <button
            onClick={handleCopy}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#f5f5f8] hover:bg-[#eeeef4] text-[#334155] transition-colors flex-shrink-0"
          >
            {copied ? <Check size={16} className="text-[#1a8047]" /> : <Copy size={16} />}
          </button>
          <button
            onClick={() => setSubView('receive')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#f5f5f8] hover:bg-[#eeeef4] text-[#334155] transition-colors flex-shrink-0"
          >
            <QrCode size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#6b6580]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1a8047]" />
          Connected to {chain.name}
          <a
            href={`${chain.explorerBase}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[#1a6fd4] hover:text-[#122d45] font-semibold transition-colors"
          >
            Explorer <ExternalLink size={11} />
          </a>
        </div>
      </Card>
    </div>
  )
}

// ─── Send Flow ────────────────────────────────────────────────────────────────

type SendStep = 'recipient' | 'amount' | 'note' | 'review' | 'submitting' | 'success' | 'error'

function SendFlow({
  balance,
  address,
  chainId,
  sessionToken,
  walletId,
  onBack,
  onSuccess,
  addActivity,
}: {
  balance: number
  address: string
  chainId?: number
  sessionToken: string
  walletId: string
  onBack: () => void
  onSuccess: () => void
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void
}) {
  const [step, setStep] = useState<SendStep>('recipient')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [recipientError, setRecipientError] = useState('')
  const [amountError, setAmountError] = useState('')
  const [nanLoading, setNanLoading] = useState(false)

  // Refs for stable access in effects
  const recipientRef = React.useRef(recipient)
  const amountRef = React.useRef(amount)
  const noteRef = React.useRef(note)
  React.useEffect(() => { recipientRef.current = recipient }, [recipient])
  React.useEffect(() => { amountRef.current = amount }, [amount])
  React.useEffect(() => { noteRef.current = note }, [note])

  // Wagmi path (browser wallet fallback when no Nan session)
  const { switchChain } = useSwitchChain()
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const isWrongChain = chainId !== undefined && chainId !== ARC_TESTNET_ID

  const useNanPath = nanBackendConfigured() && !!sessionToken && !!walletId

  // eslint-disable-next-line react/set-state-in-effect
  React.useEffect(() => {
    if (isSuccess && txHash) {
      // eslint-disable-next-line react/set-state-in-effect
      setStep('success')
      addActivity({
        type: 'sent',
        description: noteRef.current || 'Sent USDC',
        amount: parseFloat(amountRef.current),
        sign: '-',
        status: 'confirmed',
        counterparty: formatAddress(recipientRef.current),
        txHash,
      })
      toast.success(`Sent ${amountRef.current} USDC successfully`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  // eslint-disable-next-line react/set-state-in-effect
  React.useEffect(() => {
    if (writeError) {
      const msg = parseOnchainError(writeError)
      if (!msg.includes('cancelled')) {
        // eslint-disable-next-line react/set-state-in-effect
        setStep('error')
        toast.error(msg)
      } else {
        // eslint-disable-next-line react/set-state-in-effect
        setStep('review')
        reset()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError])

  const displayStep: SendStep = (isPending || isConfirming || nanLoading) ? 'submitting' : step

  const validateRecipient = () => {
    if (!recipient) { setRecipientError('Recipient address is required'); return false }
    if (!isAddress(recipient)) { setRecipientError('Enter a valid Ethereum address'); return false }
    setRecipientError('')
    return true
  }

  const validateAmount = () => {
    const n = parseFloat(amount)
    if (!amount || isNaN(n) || n <= 0) { setAmountError('Enter a valid amount'); return false }
    if (n > balance) { setAmountError(`Insufficient balance. You have ${formatUSDC(balance)} USDC`); return false }
    setAmountError('')
    return true
  }

  const handleSend = async () => {
    // ── Nan (Circle developer-controlled wallet) path ──
    if (useNanPath) {
      setNanLoading(true)
      // Need the email for Nan's API — read it from the Zustand store
      const email = useNanStore.getState().nanAuth?.email ?? address
      try {
        const result = await sendUsdc(email, sessionToken, recipient, amount)
        setStep('success')
        addActivity({
          type: 'sent',
          description: note || 'Sent USDC',
          amount: parseFloat(amount),
          sign: '-',
          status: 'confirmed',
          counterparty: formatAddress(recipient),
          txHash: result.txHash ?? undefined,
        })
        toast.success(`Sent ${amount} USDC successfully`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Transfer failed')
        setStep('error')
      } finally {
        setNanLoading(false)
      }
      return
    }
    // ── Wagmi (browser wallet) fallback ──
    if (!usdcFact) return
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    const parsed = parseAmount(ARC_TESTNET_ID, amount)
    writeContract({
      address: usdcFact.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, parsed.raw],
      chainId: ARC_TESTNET_ID,
    })
  }

  // ── Step: Success ──
  if (displayStep === 'success') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-[#dcfce7] flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-[#1a8047]" />
          </div>
          <h2 className="text-2xl font-bold text-[#122d45] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Payment sent
          </h2>
          <p className="text-[#6b6580] text-sm mb-4">Your USDC has been sent successfully.</p>
          <div className="bg-[#f9f9fc] rounded-2xl p-4 text-left space-y-2.5 mb-6 max-w-xs mx-auto">
            <Row label="Amount" value={`${formatUSDC(parseFloat(amount))} USDC`} mono />
            <Row label="Recipient" value={formatAddress(recipient)} mono />
            <Row label="Network" value="Arc Testnet" />
            {txHash && (
              <div className="pt-2 border-t border-[rgba(18,45,69,0.06)]">
                <a
                  href={buildTxExplorerUrl(ARC_TESTNET_ID, txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#1a6fd4] font-semibold hover:text-[#122d45] transition-colors"
                >
                  <ExternalLink size={12} />
                  View on explorer
                </a>
              </div>
            )}
          </div>
          <Button onClick={onSuccess} fullWidth>Back to Wallet</Button>
        </div>
      </div>
    )
  }

  // ── Step: Submitting ──
  if (displayStep === 'submitting') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#dbeafe] flex items-center justify-center mx-auto">
          <div className="w-7 h-7 border-2 border-[#1a6fd4] border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-[#122d45]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {isPending ? 'Confirm in wallet' : 'Confirming transaction'}
        </h2>
        <p className="text-sm text-[#6b6580]">
          {isPending ? 'Please approve the transaction in your wallet.' : 'Waiting for blockchain confirmation...'}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-28 lg:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={displayStep === 'recipient' ? onBack : () => setStep(displayStep === 'review' ? 'note' : displayStep === 'note' ? 'amount' : 'recipient')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#f5f5f8] text-[#334155] transition-colors"
        >
          <X size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#122d45]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Send USDC
          </h1>
          <p className="text-xs text-[#6b6580]">
            {displayStep === 'recipient' && 'Step 1 of 4 — Recipient'}
            {displayStep === 'amount' && 'Step 2 of 4 — Amount'}
            {displayStep === 'note' && 'Step 3 of 4 — Note (optional)'}
            {displayStep === 'review' && 'Step 4 of 4 — Review'}
            {displayStep === 'error' && 'Transaction failed'}
          </p>
        </div>
      </div>

      {/* Wrong chain banner */}
      {isWrongChain && (
        <div className="flex items-center gap-2 bg-[#fef9c3] border border-[#fde68a] rounded-xl px-3 py-2.5">
          <AlertCircle size={15} className="text-[#854d0e] flex-shrink-0" />
          <p className="text-sm text-[#854d0e] font-medium">
            Switch to Arc Testnet to send USDC.
          </p>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}>
            Switch
          </Button>
        </div>
      )}

      {/* Recipient step */}
      {displayStep === 'recipient' && (
        <Card padding="lg">
          <Input
            label="Recipient address"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            error={recipientError}
            autoFocus
          />
          <div className="mt-4">
            <Button
              fullWidth
              onClick={() => { if (validateRecipient()) setStep('amount') }}
              iconRight={<ChevronRight size={16} />}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {/* Amount step */}
      {displayStep === 'amount' && (
        <Card padding="lg">
          <div className="space-y-4">
            <div>
              <Input
                label="Amount"
                placeholder="0.00"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={amountError}
                suffix={<span className="text-xs font-bold text-[#6b6580]">USDC</span>}
                autoFocus
              />
              <div className="mt-2 flex items-center justify-between text-xs text-[#6b6580]">
                <span>Available: <span className="font-semibold text-[#122d45] tabular-nums">{formatUSDC(balance)} USDC</span></span>
                <button
                  onClick={() => setAmount(balance.toFixed(6))}
                  className="text-[#1a6fd4] font-semibold hover:text-[#122d45] transition-colors"
                >
                  Max
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {[5, 10, 25, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v.toString())}
                  disabled={v > balance}
                  className="flex-1 h-9 text-sm font-semibold rounded-xl bg-[#f5f5f8] hover:bg-[#eeeef4] text-[#334155] disabled:opacity-40 transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Button
              fullWidth
              onClick={() => { if (validateAmount()) setStep('note') }}
              iconRight={<ChevronRight size={16} />}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {/* Note step */}
      {displayStep === 'note' && (
        <Card padding="lg">
          <Textarea
            label="Add a note (optional)"
            placeholder="What's this payment for?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="mt-4">
            <Button fullWidth onClick={() => setStep('review')} iconRight={<ChevronRight size={16} />}>
              Review
            </Button>
          </div>
        </Card>
      )}

      {/* Review step */}
      {displayStep === 'review' && (
        <Card padding="lg">
          <h2 className="text-base font-bold text-[#122d45] mb-4">Review transaction</h2>
          <div className="space-y-3 mb-6">
            <Row label="Recipient" value={formatAddress(recipient)} mono />
            <Row label="Amount" value={`${formatUSDC(parseFloat(amount || '0'))} USDC`} mono />
            <Row label="Network" value="Arc Testnet" />
            {note && <Row label="Note" value={note} />}
            <div className="pt-2 border-t border-[rgba(18,45,69,0.06)]">
              <Row label="Estimated fee" value="~0.00 USDC (gas-free)" />
            </div>
          </div>
          <Button
            fullWidth
            onClick={() => void handleSend()}
            loading={isPending || isConfirming || nanLoading}
            disabled={!useNanPath && isWrongChain}
            size="lg"
          >
            {!useNanPath && isWrongChain ? 'Switch Network First' : 'Confirm & Send'}
          </Button>
          {writeError && (
            <div className="mt-3 flex items-start gap-2 bg-[#fee2e2] rounded-xl p-3">
              <AlertCircle size={15} className="text-[#ba2b4c] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#ba2b4c]">{parseOnchainError(writeError)}</p>
            </div>
          )}
        </Card>
      )}

      {displayStep === 'error' && (
        <div className="space-y-3">
          <Card padding="md">
            <div className="flex items-start gap-2 text-[#ba2b4c]">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Transaction failed</p>
                <p className="text-xs mt-1">{parseOnchainError(writeError)}</p>
              </div>
            </div>
          </Card>
          <Button fullWidth variant="secondary" onClick={() => { reset(); setStep('review') }}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-[#6b6580]">{label}</span>
      <span className={`text-sm font-semibold text-[#122d45] ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Receive View ─────────────────────────────────────────────────────────────

function ReceiveView({ address, onBack }: { address: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false)
  const [showRequest, setShowRequest] = useState(false)
  const [requestAmount, setRequestAmount] = useState('')
  const [requestNote, setRequestNote] = useState('')

  const handleCopy = () => {
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  const requestLink = requestAmount
    ? `nan://pay?to=${address}&amount=${requestAmount}${requestNote ? `&note=${encodeURIComponent(requestNote)}` : ''}`
    : ''

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-28 lg:pb-8">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#f5f5f8] text-[#334155]">
          <X size={18} />
        </button>
        <h1 className="text-xl font-bold text-[#122d45]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Receive USDC
        </h1>
      </div>

      <Card padding="lg" className="text-center">
        {/* QR code placeholder */}
        <div className="w-44 h-44 mx-auto mb-4 bg-[#f9f9fc] rounded-2xl flex items-center justify-center border border-[rgba(18,45,69,0.1)]">
          <div className="text-center">
            <QrCode size={56} className="text-[#122d45] mx-auto mb-2" />
            <p className="text-xs text-[#6b6580]">QR code</p>
          </div>
        </div>
        <p className="text-xs text-[#6b6580] font-medium mb-2">Your wallet address</p>
        <p className="text-sm font-mono text-[#122d45] break-all px-2 mb-4">{address}</p>
        <div className="flex gap-2">
          <Button fullWidth variant="secondary" onClick={handleCopy} icon={copied ? <Check size={15} /> : <Copy size={15} />}>
            {copied ? 'Copied' : 'Copy address'}
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => { void navigator.share?.({ title: 'My Nan Address', text: address }) }}
          >
            Share
          </Button>
        </div>
      </Card>

      {/* Payment request */}
      <Card padding="md">
        <button
          onClick={() => setShowRequest(!showRequest)}
          className="w-full flex items-center justify-between"
        >
          <span className="text-sm font-bold text-[#122d45]">Create payment request</span>
          <ChevronRight size={16} className={`text-[#6b6580] transition-transform ${showRequest ? 'rotate-90' : ''}`} />
        </button>
        {showRequest && (
          <div className="mt-4 space-y-3">
            <Input
              label="Amount (USDC)"
              placeholder="25.00"
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              suffix={<span className="text-xs font-bold text-[#6b6580]">USDC</span>}
            />
            <Input
              label="Description (optional)"
              placeholder="What's this for?"
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
            />
            {requestAmount && (
              <div className="bg-[#f9f9fc] rounded-xl p-3">
                <p className="text-xs text-[#6b6580] mb-1 font-medium">Payment request</p>
                <p className="text-sm font-bold text-[#122d45]">
                  Request {formatUSDC(parseFloat(requestAmount))} USDC
                </p>
                <button
                  onClick={() => { void navigator.clipboard.writeText(requestLink); toast.success('Request link copied') }}
                  className="mt-2 flex items-center gap-1.5 text-xs text-[#1a6fd4] font-semibold hover:text-[#122d45] transition-colors"
                >
                  <Copy size={12} /> Copy request link
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
