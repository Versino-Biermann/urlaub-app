import { useEffect, useState } from 'react'
import LinkedText from './LinkedText'

const STORAGE_KEY = 'urlaub-app.etappen'

function loadEtappen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadBookings() {
  try {
    const raw = localStorage.getItem('urlaub-app.bookings')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadRoute() {
  try {
    const raw = localStorage.getItem('urlaub-app.route')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadSightseeing() {
  try {
    const raw = localStorage.getItem('urlaub-app.sightseeing')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadEvents() {
  try {
    const raw = localStorage.getItem('urlaub-app.events')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadRestaurants() {
  try {
    const raw = localStorage.getItem('urlaub-app.restaurants')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function emptyForm() {
  return { name: '', vonDatum: '', bisDatum: '', notiz: '' }
}

export default function Etappen() {
  const [etappen, setEtappen] = useState(loadEtappen)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(etappen))
  }, [etappen])

  const bookings = loadBookings()
  const fahrten = loadRoute()
  const sightseeing = loadSightseeing()
  const events = loadEvents()
  const restaurants = loadRestaurants()

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editId !== null) {
      setEtappen((prev) =>
        prev.map((e) => (e.id === editId ? { ...e, ...form } : e)),
      )
      setEditId(null)
      setForm(emptyForm())
      return
    }
    const neueEtappe = { id: Date.now(), ...form }
    setEtappen((prev) => [...prev, neueEtappe])
    setForm(emptyForm())
  }

  function handleDelete(id) {
    setEtappen((prev) => prev.filter((e) => e.id !== id))
  }

  function handleEdit(etappe) {
    setForm({ ...emptyForm(), ...etappe })
    setEditId(etappe.id)
  }

  function handleCancelEdit() {
    setEditId(null)
    setForm(emptyForm())
  }

  return (
    <section>
      <h2>Etappen</h2>

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Stadt/Abschnitt
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="z.B. München"
            required
          />
        </label>

        <label>
          Von
          <input type="date" name="vonDatum" value={form.vonDatum} onChange={handleChange} />
        </label>

        <label>
          Bis
          <input type="date" name="bisDatum" value={form.bisDatum} onChange={handleChange} />
        </label>

        <label>
          Notiz
          <textarea
            name="notiz"
            value={form.notiz}
            onChange={handleChange}
            placeholder="Optionale Notiz"
          />
        </label>

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Etappe hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>

      {etappen.length === 0 ? (
        <p className="empty">Noch keine Etappen erfasst.</p>
      ) : (
        <ul className="list">
          {etappen.map((etappe) => {
            const zugeordneteFahrten = fahrten.filter(
              (f) => String(f.etappeId) === String(etappe.id),
            )
            const zugeordneteBuchungen = bookings.filter(
              (b) => String(b.etappeId) === String(etappe.id),
            )
            const zugeordneteSpots = sightseeing.filter(
              (s) => String(s.etappeId) === String(etappe.id),
            )
            const zugeordneteEvents = events.filter(
              (ev) => String(ev.etappeId) === String(etappe.id),
            )
            const zugeordneteRestaurants = restaurants.filter(
              (r) => String(r.etappeId) === String(etappe.id),
            )

            return (
              <li key={etappe.id} className="list-item">
                <div className="list-item-main">
                  <strong>{etappe.name}</strong>
                </div>
                {(etappe.vonDatum || etappe.bisDatum) && (
                  <div className="list-item-meta">
                    {etappe.vonDatum} – {etappe.bisDatum}
                  </div>
                )}
                {etappe.notiz && (
                  <div className="list-item-meta">
                    <LinkedText text={etappe.notiz} />
                  </div>
                )}

                <div className="list-item-meta">
                  <strong>Übersicht</strong>
                  {zugeordneteFahrten.length > 0 && (
                    <div>
                      Fahrten:{' '}
                      {zugeordneteFahrten.map((f, i) => (
                        <span key={f.id}>
                          {i > 0 && ', '}
                          {f.von} → {f.nach}
                        </span>
                      ))}
                    </div>
                  )}
                  {zugeordneteBuchungen.length > 0 && (
                    <div>
                      Buchungen:{' '}
                      {zugeordneteBuchungen.map((b, i) => (
                        <span key={b.id}>
                          {i > 0 && ', '}
                          {b.titel}
                        </span>
                      ))}
                    </div>
                  )}
                  {zugeordneteSpots.length > 0 && (
                    <div>
                      Sehenswürdigkeiten:{' '}
                      {zugeordneteSpots.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ', '}
                          {s.titel}
                        </span>
                      ))}
                    </div>
                  )}
                  {zugeordneteEvents.length > 0 && (
                    <div>
                      Events:{' '}
                      {zugeordneteEvents.map((ev, i) => (
                        <span key={ev.id}>
                          {i > 0 && ', '}
                          {ev.titel}
                        </span>
                      ))}
                    </div>
                  )}
                  {zugeordneteRestaurants.length > 0 && (
                    <div>
                      Restaurants:{' '}
                      {zugeordneteRestaurants.map((r, i) => (
                        <span key={r.id}>
                          {i > 0 && ', '}
                          {r.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {zugeordneteFahrten.length === 0 &&
                    zugeordneteBuchungen.length === 0 &&
                    zugeordneteSpots.length === 0 &&
                    zugeordneteEvents.length === 0 &&
                    zugeordneteRestaurants.length === 0 && <div>keine</div>}
                </div>

                <div className="list-item-actions">
                  <button type="button" onClick={() => handleEdit(etappe)}>
                    Bearbeiten
                  </button>
                  <button type="button" className="delete" onClick={() => handleDelete(etappe.id)}>
                    Löschen
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
