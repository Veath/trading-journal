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

const NAV = [
  { path: '', label: '概览' },
  { path: 'trades', label: '交易' },
  { path: 'days', label: '每日日志' },
  { path: 'notes', label: '学习笔记' },
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
          Trading Journal
        </a>
        <nav>
          {NAV.map((n) => (
            <a key={n.path} href={href(...(n.path ? [n.path] : []))} className={page === n.path ? 'active' : ''}>
              {n.label}
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
