import { useEffect, useState } from 'react'
import LinkedText from './LinkedText'
import EntryLink from './EntryLink'
import { formatDate } from '../format'

const STORAGE_KEY = 'urlaub-app.bookings'
const TYPES = ['Flug', 'Unterkunft', 'Mietwagen', 'Transfer']

function loadBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function emptyForm() {
  return { titel: '', typ: TYPES[0], datum: '', checkIn: '', checkOut: '', notiz: '', link: '', etappeId: '' }
}

function loadEtappenListe() {
  try {
    const raw = localStorage.getItem('urlaub-app.etappen')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function Bookings() {
  const [bookings, setBookings] = useState(loadBookings)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const etappenListe = loadEtappenListe()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings))
  }, [bookings])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.titel.trim()) return
    if (editId !== null) {
      setBookings((prev) =>
        prev.map((b) => (b.id === editId ? { ...b, ...form } : b)),
      )
      setEditId(null)
      setForm(emptyForm())
      return
    }
    const neueBuchung = { id: Date.now(), ...form }
    setBookings((prev) => [...prev, neueBuchung])
    setForm(emptyForm())
  }

  function handleDelete(id) {
    setBookings((prev) => prev.filter((b) => b.id !== id))
  }

  function handleEdit(booking) {
    setForm({ ...emptyForm(), ...booking })
    setEditId(booking.id)
  }

  function handleCancelEdit() {
    setEditId(null)
    setForm(emptyForm())
  }

  return (
    <section>
      <h2>Buchungen</h2>

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Titel
          <input
            type="text"
            name="titel"
            value={form.titel}
            onChange={handleChange}
            placeholder="z.B. Lufthansa LH123"
            required
          />
        </label>

        <label>
          Typ
          <select name="typ" value={form.typ} onChange={handleChange}>
            {TYPES.map((typ) => (
              <option key={typ} value={typ}>
                {typ}
              </option>
            ))}
          </select>
        </label>

        {form.typ === 'Unterkunft' ? (
          <>
            <label>
              Check-in
              <input type="date" name="checkIn" value={form.checkIn} onChange={handleChange} />
            </label>

            <label>
              Check-out
              <input type="date" name="checkOut" value={form.checkOut} onChange={handleChange} />
            </label>
          </>
        ) : (
          <label>
            Datum
            <input type="date" name="datum" value={form.datum} onChange={handleChange} />
          </label>
        )}

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

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Buchung hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>

      {bookings.length === 0 ? (
        <p className="empty">Noch keine Buchungen erfasst.</p>
      ) : (
        <ul className="list">
          {bookings.map((b) => (
            <li key={b.id} className="list-item">
              <div className="list-item-main">
                <strong>{b.titel}</strong>
                <span className="badge">{b.typ}</span>
              </div>
              {b.typ === 'Unterkunft' ? (
                <>
                  {b.checkIn && <div className="list-item-meta">Check-in: {formatDate(b.checkIn)}</div>}
                  {b.checkOut && <div className="list-item-meta">Check-out: {formatDate(b.checkOut)}</div>}
                </>
              ) : (
                b.datum && <div className="list-item-meta">Datum: {formatDate(b.datum)}</div>
              )}
              {b.etappeId && (
                <div className="list-item-meta">
                  Etappe: {etappenListe.find((et) => String(et.id) === String(b.etappeId))?.name || b.etappeId}
                </div>
              )}
              {b.notiz && (
                <div className="list-item-meta">
                  <LinkedText text={b.notiz} />
                </div>
              )}
              <EntryLink url={b.link} />
              <div className="list-item-actions">
                <button type="button" onClick={() => handleEdit(b)}>
                  Bearbeiten
                </button>
                <button type="button" className="delete" onClick={() => handleDelete(b.id)}>
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
