import { useState } from 'react'
import LinkedText from './LinkedText'
import EntryLink from './EntryLink'
import Datenstand from './Datenstand'
import { formatDate, sortByDate } from '../format'
import { useListe, useListen } from '../useListe'

// Die fuenf Nebenlisten, die diese Ansicht ueber "etappeId" verknuepft.
// Bewusst ausserhalb der Komponente: das Array behaelt so seine Identitaet
// zwischen zwei Darstellungen und der Ladeeffekt laeuft nicht endlos nach.
const NEBENLISTEN = ['bookings', 'route', 'sightseeing', 'events', 'restaurants']

function emptyForm() {
  return { name: '', vonDatum: '', bisDatum: '', notiz: '', link: '' }
}

export default function Etappen() {
  const liste = useListe('etappen')
  const etappen = liste.eintraege
  const neben = useListen(NEBENLISTEN)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)

  const bookings = neben.daten.bookings || []
  const fahrten = neben.daten.route || []
  const sightseeing = neben.daten.sightseeing || []
  const events = neben.daten.events || []
  const restaurants = neben.daten.restaurants || []
  // Nur die Anzeige-Reihenfolge: chronologisch nach Start der Etappe.
  const sortierteEtappen = sortByDate(etappen, (e) => e.vonDatum)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
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

  async function handleDelete(etappe) {
    if (!window.confirm(`Etappe "${etappe.name}" wirklich löschen?`)) return
    await liste.loeschen(etappe.id)
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

      <Datenstand
        laden={liste.laden || neben.laden}
        ladeFehler={liste.ladeFehler}
        ausKopie={liste.ausKopie || neben.ausKopie}
        stand={liste.stand || neben.stand}
        schreibFehler={liste.schreibFehler}
      />

      {liste.laden || liste.ladeFehler ? null : etappen.length === 0 ? (
        <p className="empty">Noch keine Etappen erfasst.</p>
      ) : (
        <ul className="list">
          {sortierteEtappen.map((etappe) => {
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
                    {formatDate(etappe.vonDatum)} – {formatDate(etappe.bisDatum)}
                  </div>
                )}
                {etappe.notiz && (
                  <div className="list-item-meta">
                    <LinkedText text={etappe.notiz} />
                  </div>
                )}
                <EntryLink url={etappe.link} />

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
                  <button type="button" className="delete" onClick={() => handleDelete(etappe)}>
                    Löschen
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

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

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Etappe hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>
    </section>
  )
}
