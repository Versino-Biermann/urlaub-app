import { useEffect, useState } from 'react'
import LinkedText from './LinkedText'

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
  return { name: '', ort: '', kueche: '', reservierung: '', kontakt: '', notiz: '', etappeId: '' }
}

function loadEtappenListe() {
  try {
    const raw = localStorage.getItem('urlaub-app.etappen')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState(loadRestaurants)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const etappenListe = loadEtappenListe()

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

  function handleDelete(id) {
    setRestaurants((prev) => prev.filter((r) => r.id !== id))
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

      {restaurants.length === 0 ? (
        <p className="empty">Noch keine Restaurants erfasst.</p>
      ) : (
        <ul className="list">
          {restaurants.map((r) => (
            <li key={r.id} className="list-item">
              <div className="list-item-main">
                <strong>{r.name}</strong>
                {r.kueche && <span className="badge">{r.kueche}</span>}
              </div>
              {r.ort && <div className="list-item-meta">Ort: {r.ort}</div>}
              {r.reservierung && <div className="list-item-meta">Reservierung: {r.reservierung}</div>}
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
              <div className="list-item-actions">
                <button type="button" onClick={() => handleEdit(r)}>
                  Bearbeiten
                </button>
                <button type="button" className="delete" onClick={() => handleDelete(r.id)}>
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
