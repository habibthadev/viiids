import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, MagnifyingGlass, X } from '@phosphor-icons/react'
import type { Movie, PlatformId } from '~/lib/api'
import { PlatformIcon, titleSearch, type TitleContext } from '~/components/MovieCard'

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder?: string
}) {
  return (
    <form
      className="search-group"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <span className="sg-icon" aria-hidden="true">
        <MagnifyingGlass size={18} />
      </span>
      <input
        className="sg-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search titles'}
        aria-label="Search titles"
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className="sg-clear" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={16} />
        </button>
      )}
      <button type="submit" className="btn btn-black sg-go">
        Go
      </button>
    </form>
  )
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={`seg-btn${o.value === value ? ' active' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Chip({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      className={`chip${on ? ' on' : ''}`}
      onClick={onToggle}
    >
      <span className="chip-box" aria-hidden="true">
        {on && <Check size={12} weight="bold" />}
      </span>
      {label}
    </button>
  )
}

export function TitleRow({ movie, platform, context }: { movie: Movie; platform: PlatformId; context: TitleContext }) {
  return (
    <Link
      to="/$platformId/title"
      params={{ platformId: platform }}
      search={titleSearch(context)}
      className="title-row"
      data-reveal
    >
      <span className="title-thumb" aria-hidden="true">
        {movie.CoverPhotoLink ? (
          <img src={movie.CoverPhotoLink} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <PlatformIcon id={platform} size={24} />
        )}
      </span>
      <span className="title-main">
        <strong className="title-name">{movie.Title}</strong>
        <span className="title-sub">
          {movie.Year > 0 ? `${movie.Year} · ` : ''}
          {movie.IsSeries ? 'Series' : 'Movie'}
          {movie.UploadDate ? ` · ${movie.UploadDate}` : ''}
        </span>
      </span>
      {movie.Year > 0 && <span className="badge soft hide-sm">{movie.Year}</span>}
      <ArrowRight size={18} className="title-chev" aria-hidden="true" />
    </Link>
  )
}

export function RowSkeleton() {
  return (
    <div className="title-row" aria-hidden="true">
      <span className="skel title-thumb" />
      <span className="title-main" style={{ display: 'grid', gap: 8 }}>
        <span className="skel" style={{ height: 15, width: '70%' }} />
        <span className="skel" style={{ height: 12, width: '40%' }} />
      </span>
    </div>
  )
}
