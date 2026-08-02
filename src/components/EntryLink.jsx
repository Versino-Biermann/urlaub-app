import { linkHref, linkLabel } from '../format'

/**
 * Optionaler Link eines Eintrags (Feld `link`). Ohne Wert wird nichts
 * gerendert - bestehende Eintraege ohne `link` bleiben unveraendert.
 * Angezeigt wird nur der Hostname, nicht die volle URL.
 */
export default function EntryLink({ url }) {
  const href = linkHref(url)
  if (!href) return null

  return (
    <div className="list-item-meta">
      Link:{' '}
      <a href={href} target="_blank" rel="noopener noreferrer">
        {linkLabel(href)}
      </a>
    </div>
  )
}
