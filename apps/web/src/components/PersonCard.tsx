import type { Card } from '../types.ts'
import { Avatar } from './Avatar.tsx'

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function formatCount(n: number | null): string | null {
  if (n == null) return null
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

interface Props {
  card: Card
  onClick?: () => void
  highlight?: boolean
}

export function PersonCard({ card, onClick, highlight }: Props) {
  const followers = formatCount(card.followers)
  return (
    <button
      type="button"
      className={`person${highlight ? ' person--target' : ''}`}
      data-id={card.id}
      data-address={card.address}
      onClick={onClick}
    >
      <Avatar address={card.address} src={card.avatar} name={card.name} />
      <span className="person__name">{card.name ?? shortAddress(card.address)}</span>
      {followers && <span className="person__followers">{followers}</span>}
    </button>
  )
}
