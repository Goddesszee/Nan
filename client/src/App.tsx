import { useNanStore } from './store/nanStore'
import { AppShell } from './components/layout/AppShell'
import { LandingPage } from './components/pages/LandingPage'
import { OnboardingPage } from './components/pages/OnboardingPage'
import { HomePage } from './components/pages/HomePage'
import { WalletPage } from './components/pages/WalletPage'
import { ShopPage } from './components/pages/ShopPage'
import { AgentPage } from './components/pages/AgentPage'
import { ActivityPage } from './components/pages/ActivityPage'
import { SettingsPage } from './components/pages/SettingsPage'

export default function App() {
  const { activeView } = useNanStore()

  if (activeView === 'landing') return <LandingPage />
  if (activeView === 'onboarding') return <OnboardingPage />

  return (
    <AppShell>
      {activeView === 'home' && <HomePage />}
      {activeView === 'wallet' && <WalletPage />}
      {activeView === 'send' && <WalletPage initialSubView="send" />}
      {activeView === 'receive' && <WalletPage initialSubView="receive" />}
      {activeView === 'shop' && <ShopPage />}
      {activeView === 'agent' && <AgentPage />}
      {activeView === 'activity' && <ActivityPage />}
      {activeView === 'settings' && <SettingsPage />}
      {activeView === 'help' && <SettingsPage />}
    </AppShell>
  )
}
