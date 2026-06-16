import type { Card } from '../types.ts'
import { Avatar } from './Avatar.tsx'
import { shortAddress } from './PersonCard.tsx'

function HeroNode({ label, card }: { label: string; card: Card }) {
  return (
    <div className="heronode">
      <span className="heronode__label">{label}</span>
      <Avatar address={card.address} src={card.avatar} name={card.name} size={64} />
      <span className="heronode__name">{card.name ?? shortAddress(card.address)}</span>
    </div>
  )
}

export function HeroBar({ start, target, par }: { start: Card; target: Card; par: number }) {
  return (
    <div className="hero">
      <HeroNode label="START" card={start} />
      <div className="hero__link">
        <span className="hero__arrow">→</span>
        <span className="hero__par">best: {par}</span>
      </div>
      <HeroNode label="TARGET" card={target} />
    </div>
  )
}
