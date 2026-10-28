import { useMemo, useState } from 'react'
import { trades } from './lib/load'
import { applyFilters, defaultFilters, type Filters } from './lib/filters'
import { href, useRoute } from './lib/router'
import FilterBar from './components/FilterBar'
import Dashboard from './pages/Dashboard'
import TradeList from './pages/TradeList'
import TradeDetail from './pages/TradeDetail'
import Days from './pages/Days'
import Notes from './pages/Notes'

// 图标为 24×24 描边路径；窄屏时导航移到底部标签栏
const NAV = [
  { path: '', label: '概览', icon: 'M4 19V11M10 19V5M16 19v-6M22 19H2' },
  { path: 'trades', label: '交易', icon: 'M4 6h16M4 12h16M4 18h10' },
  { path: 'days', label: '每日日志', icon: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z' },
  { path: 'notes', label: '学习笔记', icon: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7' },
]

export default function App() {
  const route = useRoute()
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const filtered = useMemo(() => applyFilters(trades, filters), [filters])
  const [page = '', param] = route
  const showFilters = page === '' || (page === 'trades' && !param)

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={href()}>
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}brand/logo.png`}
            width="40"
            height="40"
            alt=""
          />
          <span className="brand-copy">
            <span className="brand-name">交易日志</span>
            <span className="brand-tagline" aria-hidden="true">记录 · 复盘 · 精进</span>
          </span>
        </a>
        <nav className="nav" aria-label="主导航">
          {NAV.map((n) => (
            <a
              key={n.path}
              href={href(...(n.path ? [n.path] : []))}
              className={page === n.path ? 'active' : ''}
              aria-current={page === n.path ? 'page' : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d={n.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span data-label={n.label}>{n.label}</span>
            </a>
          ))}
        </nav>
      </header>
      <main>
        {showFilters && <FilterBar trades={trades} value={filters} onChange={setFilters} />}
        {page === '' && <Dashboard trades={filtered} />}
        {page === 'trades' && !param && <TradeList trades={filtered} />}
        {page === 'trades' && param && <TradeDetail id={param} />}
        {page === 'days' && <Days />}
        {page === 'notes' && <Notes path={route.slice(1).join('/')} />}
      </main>
    </div>
  )
}
