export default function Navigation({ current, onChange }) {
  return (
    <nav className="nav">
      <button
        type="button"
        className={current === 'etappen' ? 'active' : ''}
        onClick={() => onChange('etappen')}
      >
        Etappen
      </button>
      <button
        type="button"
        className={current === 'buchungen' ? 'active' : ''}
        onClick={() => onChange('buchungen')}
      >
        Buchungen
      </button>
      <button
        type="button"
        className={current === 'reiseroute' ? 'active' : ''}
        onClick={() => onChange('reiseroute')}
      >
        Reiseroute
      </button>
      <button
        type="button"
        className={current === 'events' ? 'active' : ''}
        onClick={() => onChange('events')}
      >
        Events
      </button>
      <button
        type="button"
        className={current === 'restaurants' ? 'active' : ''}
        onClick={() => onChange('restaurants')}
      >
        Restaurants
      </button>
      <button
        type="button"
        className={current === 'sehenswuerdigkeiten' ? 'active' : ''}
        onClick={() => onChange('sehenswuerdigkeiten')}
      >
        Sehenswürdigkeiten
      </button>
    </nav>
  )
}
