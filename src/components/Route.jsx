import { useState } from 'react'
import LinkedText from './LinkedText'
import EntryLink from './EntryLink'
import Datenstand from './Datenstand'
import { formatDate, sortByDate } from '../format'
import { routenUrl, ortsUrl, karteEinbettenUrl } from '../maps'
import { useListe } from '../useListe'

function emptyForm() {
  return { von: '', nach: '', datum: '', distanz: '', notiz: '', link: '', etappeId: '' }
}

const OHNE_ETAPPE = '__ohne-etappe__'

function matchesEtappeFilter(eintrag, filter) {
  if (!filter) return true
  if (filter === OHNE_ETAPPE) {
    return eintrag.etappeId === undefined || eintrag.etappeId === null || eintrag.etappeId === ''
  }
  return String(eintrag.etappeId) === String(filter)
}

export default function Route() {
  const liste = useListe('route')
  const etappen = liste.eintraege
  // Nur lesend: die Etappen liefern die Auswahl fuer Filter und Zuordnung.
  const etappenListe = useListe('etappen').eintraege
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [etappeFilter, setEtappeFilter] = useState('')
  // Nur die Anzeige-Reihenfolge: chronologisch nach Fahrt-Datum.
  const sortierteFahrten = sortByDate(etappen, (f) => f.datum)
  const gefilterteFahrten = sortierteFahrten.filter((f) => matchesEtappeFilter(f, etappeFilter))

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.von.trim() || !form.nach.trim()) return
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

  async function handleDelete(fahrt) {
    if (!window.confirm(`Fahrt "${fahrt.von} → ${fahrt.nach}" wirklich löschen?`)) return
    await liste.loeschen(fahrt.id)
  }

  function handleEdit(fahrt) {
    setForm({ ...emptyForm(), ...fahrt })
    setEditId(fahrt.id)
  }

  function handleCancelEdit() {
    setEditId(null)
    setForm(emptyForm())
  }

  return (
    <section>
      <h2>Reiseroute</h2>

      <Datenstand
        laden={liste.laden}
        ladeFehler={liste.ladeFehler}
        ausKopie={liste.ausKopie}
        stand={liste.stand}
        schreibFehler={liste.schreibFehler}
      />

      {etappenListe.length > 0 && (
        <div className="list-filter">
          <label htmlFor="route-etappe-filter">Etappe</label>
          <select
            id="route-etappe-filter"
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

      {liste.laden || liste.ladeFehler ? null : etappen.length === 0 ? (
        <p className="empty">Noch keine Fahrten erfasst.</p>
      ) : gefilterteFahrten.length === 0 ? (
        <p className="empty">Keine Fahrten für diese Etappe.</p>
      ) : (
        <ul className="list">
          {gefilterteFahrten.map((e, index) => {
            const route = routenUrl(e.von, e.nach)
            const kartenUrl = karteEinbettenUrl(e.nach)
            const zielUrl = ortsUrl(e.nach)

            return (
              <li key={e.id} className="list-item">
                <div className="fahrt-layout">
                  <div className="fahrt-inhalt">
                    <div className="list-item-main">
                      <span className="badge">{index + 1}</span>
                      <strong>
                        {e.von} → {e.nach}
                      </strong>
                    </div>
                    {e.datum && <div className="list-item-meta">Datum: {formatDate(e.datum)}</div>}
                    {e.distanz && <div className="list-item-meta">Distanz: {e.distanz}</div>}
                    {e.etappeId && (
                      <div className="list-item-meta">
                        Etappe: {etappenListe.find((et) => String(et.id) === String(e.etappeId))?.name || e.etappeId}
                      </div>
                    )}
                    {e.notiz && (
                      <div className="list-item-meta">
                        <LinkedText text={e.notiz} />
                      </div>
                    )}
                    <EntryLink url={e.link} />
                    {route && (
                      <div className="list-item-meta">
                        <a href={route} target="_blank" rel="noopener noreferrer">
                          Route in Google Maps
                        </a>
                      </div>
                    )}
                    <div className="list-item-actions">
                      <button type="button" onClick={() => handleEdit(e)}>
                        Bearbeiten
                      </button>
                      <button type="button" className="delete" onClick={() => handleDelete(e)}>
                        Löschen
                      </button>
                    </div>
                  </div>

                  {kartenUrl && (
                    <div className="fahrt-karte">
                      <iframe
                        src={kartenUrl}
                        title={`Karte ${e.nach}`}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <a href={zielUrl} target="_blank" rel="noopener noreferrer">
                        In Google Maps öffnen
                      </a>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Von
          <input
            type="text"
            name="von"
            value={form.von}
            onChange={handleChange}
            placeholder="z.B. München"
            required
          />
        </label>

        <label>
          Nach
          <input
            type="text"
            name="nach"
            value={form.nach}
            onChange={handleChange}
            placeholder="z.B. Salzburg"
            required
          />
        </label>

        <label>
          Datum
          <input type="date" name="datum" value={form.datum} onChange={handleChange} />
        </label>

        <label>
          Distanz
          <input
            type="text"
            name="distanz"
            value={form.distanz}
            onChange={handleChange}
            placeholder="Optional, z.B. 120 km"
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

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Fahrt hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>
    </section>
  )
}
