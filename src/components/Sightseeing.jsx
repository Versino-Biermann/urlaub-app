import { useState } from 'react'
import LinkedText from './LinkedText'
import EntryLink from './EntryLink'
import Datenstand from './Datenstand'
import { useListe } from '../useListe'

const STATUS = ['geplant', 'besucht']

function emptyForm() {
  return { titel: '', ort: '', kategorie: '', notiz: '', link: '', status: STATUS[0], etappeId: '' }
}

const OHNE_ETAPPE = '__ohne-etappe__'

function matchesEtappeFilter(eintrag, filter) {
  if (!filter) return true
  if (filter === OHNE_ETAPPE) {
    return eintrag.etappeId === undefined || eintrag.etappeId === null || eintrag.etappeId === ''
  }
  return String(eintrag.etappeId) === String(filter)
}

export default function Sightseeing() {
  const liste = useListe('sightseeing')
  const spots = liste.eintraege
  // Nur lesend: die Etappen liefern die Auswahl fuer Filter und Zuordnung.
  const etappenListe = useListe('etappen').eintraege
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [etappeFilter, setEtappeFilter] = useState('')
  const gefilterteSpots = spots.filter((s) => matchesEtappeFilter(s, etappeFilter))

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.titel.trim()) return
    if (editId !== null) {
      const ok = await liste.aendern(editId, form)
      if (!ok) return
      setEditId(null)
      setForm(emptyForm())
      return
    }
    const ok = await liste.anlegen(form)
    if (ok) setForm(emptyForm())
  }

  async function handleDelete(spot) {
    if (!window.confirm(`Sehenswürdigkeit "${spot.titel}" wirklich löschen?`)) return
    await liste.loeschen(spot.id)
  }

  function handleEdit(spot) {
    setForm({ ...emptyForm(), ...spot })
    setEditId(spot.id)
  }

  function handleCancelEdit() {
    setEditId(null)
    setForm(emptyForm())
  }

  async function toggleStatus(id) {
    const spot = spots.find((s) => String(s.id) === String(id))
    if (!spot) return
    await liste.aendern(id, {
      ...spot,
      status: spot.status === 'geplant' ? 'besucht' : 'geplant',
    })
  }

  return (
    <section>
      <h2>Sehenswürdigkeiten</h2>

      <Datenstand
        laden={liste.laden}
        ladeFehler={liste.ladeFehler}
        ausKopie={liste.ausKopie}
        stand={liste.stand}
        schreibFehler={liste.schreibFehler}
      />

      {etappenListe.length > 0 && (
        <div className="list-filter">
          <label htmlFor="sightseeing-etappe-filter">Etappe</label>
          <select
            id="sightseeing-etappe-filter"
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

      {liste.laden || liste.ladeFehler ? null : spots.length === 0 ? (
        <p className="empty">Noch keine Sehenswürdigkeiten erfasst.</p>
      ) : gefilterteSpots.length === 0 ? (
        <p className="empty">Keine Sehenswürdigkeiten für diese Etappe.</p>
      ) : (
        <ul className="list">
          {gefilterteSpots.map((s) => (
            <li key={s.id} className="list-item">
              <div className="list-item-main">
                <strong>{s.titel}</strong>
                <span className={`badge status-${s.status}`}>{s.status}</span>
              </div>
              {s.ort && <div className="list-item-meta">Ort: {s.ort}</div>}
              {s.kategorie && <div className="list-item-meta">Kategorie: {s.kategorie}</div>}
              {s.etappeId && (
                <div className="list-item-meta">
                  Etappe: {etappenListe.find((et) => String(et.id) === String(s.etappeId))?.name || s.etappeId}
                </div>
              )}
              {s.notiz && (
                <div className="list-item-meta">
                  <LinkedText text={s.notiz} />
                </div>
              )}
              <EntryLink url={s.link} />
              <div className="list-item-actions">
                <button type="button" onClick={() => toggleStatus(s.id)}>
                  Status wechseln
                </button>
                <button type="button" onClick={() => handleEdit(s)}>
                  Bearbeiten
                </button>
                <button type="button" className="delete" onClick={() => handleDelete(s)}>
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
            placeholder="z.B. Eiffelturm"
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
            placeholder="z.B. Paris"
          />
        </label>

        <label>
          Kategorie
          <input
            type="text"
            name="kategorie"
            value={form.kategorie}
            onChange={handleChange}
            placeholder="z.B. Bauwerk, Museum, Natur"
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

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Sehenswürdigkeit hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>
    </section>
  )
}
