import { useEffect, useState } from 'react'
import LinkedText from './LinkedText'
import EntryLink from './EntryLink'
import { formatDate } from '../format'

const STORAGE_KEY = 'urlaub-app.events'
const STATUS = ['geplant', 'gebucht']

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function emptyForm() {
  return { titel: '', datum: '', ort: '', kontakt: '', status: STATUS[0], notiz: '', link: '', etappeId: '' }
}

function loadEtappenListe() {
  try {
    const raw = localStorage.getItem('urlaub-app.etappen')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const OHNE_ETAPPE = '__ohne-etappe__'

function matchesEtappeFilter(eintrag, filter) {
  if (!filter) return true
  if (filter === OHNE_ETAPPE) {
    return eintrag.etappeId === undefined || eintrag.etappeId === null || eintrag.etappeId === ''
  }
  return String(eintrag.etappeId) === String(filter)
}

export default function Events() {
  const [events, setEvents] = useState(loadEvents)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [etappeFilter, setEtappeFilter] = useState('')
  const etappenListe = loadEtappenListe()
  const gefilterteEvents = events.filter((ev) => matchesEtappeFilter(ev, etappeFilter))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  }, [events])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.titel.trim()) return
    if (editId !== null) {
      setEvents((prev) =>
        prev.map((ev) => (ev.id === editId ? { ...ev, ...form } : ev)),
      )
      setEditId(null)
      setForm(emptyForm())
      return
    }
    const neuesEvent = { id: Date.now(), ...form }
    setEvents((prev) => [...prev, neuesEvent])
    setForm(emptyForm())
  }

  function handleDelete(event) {
    if (!window.confirm(`Event "${event.titel}" wirklich löschen?`)) return
    setEvents((prev) => prev.filter((ev) => ev.id !== event.id))
  }

  function handleEdit(event) {
    setForm({ ...emptyForm(), ...event })
    setEditId(event.id)
  }

  function handleCancelEdit() {
    setEditId(null)
    setForm(emptyForm())
  }

  return (
    <section>
      <h2>Events</h2>

      {etappenListe.length > 0 && (
        <div className="list-filter">
          <label htmlFor="events-etappe-filter">Etappe</label>
          <select
            id="events-etappe-filter"
            value={etappeFilter}
            onChange={(e) => setEtappeFilter(e.target.value)}
          >
            <option value="">Alle Etappen</option>
            {etappenListe.map((etappe) => (
              <option key={etappe.id} value={etappe.id}>
                {etappe.name}
              </option>
            ))}
            <option value={OHNE_ETAPPE}>Ohne Etappe</option>
          </select>
        </div>
      )}

      {events.length === 0 ? (
        <p className="empty">Noch keine Events erfasst.</p>
      ) : gefilterteEvents.length === 0 ? (
        <p className="empty">Keine Events für diese Etappe.</p>
      ) : (
        <ul className="list">
          {gefilterteEvents.map((ev) => (
            <li key={ev.id} className="list-item">
              <div className="list-item-main">
                <strong>{ev.titel}</strong>
                <span className={`badge status-${ev.status}`}>{ev.status}</span>
              </div>
              {ev.ort && <div className="list-item-meta">Ort: {ev.ort}</div>}
              {ev.datum && <div className="list-item-meta">Datum: {formatDate(ev.datum)}</div>}
              {ev.kontakt && <div className="list-item-meta">Kontakt: {ev.kontakt}</div>}
              {ev.etappeId && (
                <div className="list-item-meta">
                  Etappe: {etappenListe.find((et) => String(et.id) === String(ev.etappeId))?.name || ev.etappeId}
                </div>
              )}
              {ev.notiz && (
                <div className="list-item-meta">
                  <LinkedText text={ev.notiz} />
                </div>
              )}
              <EntryLink url={ev.link} />
              <div className="list-item-actions">
                <button type="button" onClick={() => handleEdit(ev)}>
                  Bearbeiten
                </button>
                <button type="button" className="delete" onClick={() => handleDelete(ev)}>
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Titel
          <input
            type="text"
            name="titel"
            value={form.titel}
            onChange={handleChange}
            placeholder="z.B. Stadtführung Altstadt"
            required
          />
        </label>

        <label>
          Datum
          <input type="date" name="datum" value={form.datum} onChange={handleChange} />
        </label>

        <label>
          Ort
          <input
            type="text"
            name="ort"
            value={form.ort}
            onChange={handleChange}
            placeholder="z.B. Rathausplatz"
          />
        </label>

        <label>
          Kontakt
          <input
            type="text"
            name="kontakt"
            value={form.kontakt}
            onChange={handleChange}
            placeholder="z.B. Anbieter, Telefon, E-Mail"
          />
        </label>

        <label>
          Status
          <select name="status" value={form.status} onChange={handleChange}>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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

        <label>
          Link (URL)
          <input
            type="url"
            name="link"
            value={form.link}
            onChange={handleChange}
            placeholder="z.B. https://www.booking.com/…"
          />
        </label>

        <label>
          Etappe
          <select name="etappeId" value={form.etappeId} onChange={handleChange}>
            <option value="">— keine —</option>
            {etappenListe.map((etappe) => (
              <option key={etappe.id} value={etappe.id}>
                {etappe.name}
              </option>
            ))}
          </select>
        </label>

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Event hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>
    </section>
  )
}
