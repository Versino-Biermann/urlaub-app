import { useEffect, useState } from 'react'
import LinkedText from './LinkedText'

const STORAGE_KEY = 'urlaub-app.route'

function loadEtappen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function emptyForm() {
  return { von: '', nach: '', datum: '', distanz: '', notiz: '', etappeId: '' }
}

function loadEtappenListe() {
  try {
    const raw = localStorage.getItem('urlaub-app.etappen')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function Route() {
  const [etappen, setEtappen] = useState(loadEtappen)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const etappenListe = loadEtappenListe()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(etappen))
  }, [etappen])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.von.trim() || !form.nach.trim()) return
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
          Distanz (km)
          <input
            type="number"
            name="distanz"
            value={form.distanz}
            onChange={handleChange}
            placeholder="Optional"
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

        <button type="submit">{editId !== null ? 'Änderungen speichern' : 'Fahrt hinzufügen'}</button>
        {editId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Abbrechen
          </button>
        )}
      </form>

      {etappen.length === 0 ? (
        <p className="empty">Noch keine Fahrten erfasst.</p>
      ) : (
        <ul className="list">
          {etappen.map((e, index) => (
            <li key={e.id} className="list-item">
              <div className="list-item-main">
                <span className="badge">{index + 1}</span>
                <strong>
                  {e.von} → {e.nach}
                </strong>
              </div>
              {e.datum && <div className="list-item-meta">Datum: {e.datum}</div>}
              {e.distanz && <div className="list-item-meta">Distanz: {e.distanz} km</div>}
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
              <div className="list-item-actions">
                <button type="button" onClick={() => handleEdit(e)}>
                  Bearbeiten
                </button>
                <button type="button" className="delete" onClick={() => handleDelete(e.id)}>
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
