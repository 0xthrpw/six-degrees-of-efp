import { useState } from 'react'

interface Props {
  address: string
  src?: string | null
  name?: string | null
  size?: number
}

/** Lightweight avatar with a deterministic colored fallback for missing ENS
 *  avatars. Used in the dense following grid where hundreds may render. */
export function Avatar({ address, src, name, size = 44 }: Props) {
  const [failed, setFailed] = useState(false)
  const show = src && !failed
  const initials = (name ?? address.slice(2)).slice(0, 2).toUpperCase()
  const hue = Number.parseInt(address.slice(2, 8), 16) % 360

  if (show) {
    return (
      <img
        className="avatar"
        src={src}
        alt={name ?? address}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      className="avatar avatar--fallback"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 42%)`, fontSize: size * 0.36 }}
      aria-label={name ?? address}
    >
      {initials}
    </div>
  )
}
