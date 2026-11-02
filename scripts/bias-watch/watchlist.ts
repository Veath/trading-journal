// 行情列表：跟随导师关注的品种（Binance USDT 永续代码）。
// Binance 没有 ES / NQ / 日经合约，用 ETF 永续代替，价格是 ETF 价格，不是指数点位。
export const WATCHLIST: { symbol: string; note?: string }[] = [
  { symbol: 'XAUUSDT', note: '黄金' },
  { symbol: 'XAGUSDT', note: '白银' },
  { symbol: 'CLUSDT', note: '原油' },
  { symbol: 'QQQUSDT', note: '≈ NQ' },
  { symbol: 'SPYUSDT', note: '≈ ES' },
  { symbol: 'EWJUSDT', note: '≈ 日经，成交薄' },
  { symbol: 'BTCUSDT', note: '比特币' },
]
