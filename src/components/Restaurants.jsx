import { useEffect, useState } from 'react'
import LinkedText from './LinkedText'
import EntryLink from './EntryLink'
import { formatDate } from '../format'

const STORAGE_KEY = 'urlaub-app.restaurants'

function loadRestaurants() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function emptyForm() {
  return { name: '', ort: '', kueche: '', reservierung: '', kontakt: '', notiz: '', link: '', etappeId: '' }
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

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState(loadRestaurants)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [etappeFilter, setEtappeFilter] = useState('')
  const etappenListe = loadEtappenListe()
  const gefilterteRestaurants = restaurants.filter((r) => matchesEtappeFilter(r, etappeFilter))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants))
  }, [restaurants])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editId !== null) {
      setRestaurants((prev) =>
        prev.map((r) => (r.id === editId ? { ...r, ...form } : r)),
      )
      setEditId(null)
      setForm(emptyForm())
      return
    }
    const neuesRestaurant = { id: Date.now(), ...form }
    setRestaurants((prev) => [...prev, neuesRestaurant])
    setForm(emptyForm())
  }

  function handleDelete(restaurant) {
    if (!window.confirm(`Restaurant "${restaurant.name}" wirklich löschen?`)) return
    setRestaurants((prev) => prev.filter((r) => r.id !== restaurant.id))
  }

  function handleEdit(restaurant) {
    setForm({ ...emptyForm(), ...restaurant })
    setEditId(restaurant.id)
  }

  function handleCancelEdit() {
    setEditId(null)
    setForm(emptyForm())
  }

  return (
    <section>
      <h2>Restaurants</h2>

      {etappenListe.length > 0 && (
        <div className="list-filter">
          <label htmlFor="restaurants-etappe-filter">Etappe</label>
          <select
            id="restaurants-etappe-filter"
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

      {restaurants.length === 0 ? (
        <p className="empty">Noch keine Restaurants erfasst.</p>
      ) : gefilterteRestaurants.length === 0 ? (
        <p className="empty">Keine Restaurants für diese Etappe.</p>
      ) : (
        <ul className="list">
          {gefilterteRestaurants.map((r) => (
            <li key={r.id} className="list-item">
              <div className="list-item-main">
                <strong>{r.name}</strong>
                {r.kueche && <span className="badge">{r.kueche}</span>}
              </div>
              {r.ort && <div className="list-item-meta">Ort: {r.ort}</div>}
              {r.reservierung && (
                <div className="list-item-meta">Reservierung: {formatDate(r.reservierung)}</div>
              )}
              {r.kontakt && <div className="list-item-meta">Kontakt: {r.kontakt}</div>}
              {r.etappeId && (
                <div className="list-item-meta">
                  Etappe: {etappenListe.find((et) => String(et.id) === String(r.etappeId))?.name || r.etappeId}
                </div>
              )}
              {r.notiz && (
                <div className="list-item-meta">
                  <LinkedText text={r.notiz} />
                </div>
              )}
              <EntryLink url={r.link} />
              <div className="list-item-actions">
                <button type="button" onClick={() => handleEdit(r)}>
                  Bearbeiten
                </button>
                <button type="button" className="delete" onClick={() => handleDelete(r)}>
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Name
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="z.B. Trattoria da Mario"
            required
          />
        </label>

        <label>
          Ort
          <input
            type="text"
            name="ort"
            value={form.ort}
            onChange={handleChange}
            placeholder="z.B. Rom"
          />
        </label>

        <label>
          Küche
          <input
            type="text"
            name="kueche"
            value={form.kueche}
            onChange={handleChange}
            placeholder="z.B. italienisch, regional"
          />
        </label>

        <label>
          Reservierung
          <input type="date" name="reservierung" value={form.reservierung} onChange={handleChange} />
        </label>

        <label>
          Kontakt
          <input
            type="text"
            name="kontakt"
            value={form.kontakt}
            onChange={handleChange}
            placeholder="z.B. Telefon, E-Mail"
          />
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

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Restaurant hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>
    </section>
  )
}
