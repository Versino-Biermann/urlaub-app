import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bookings from './Bookings'
import Route from './Route'
import Sightseeing from './Sightseeing'
import Events from './Events'
import Restaurants from './Restaurants'

// Verhaltenstests fuer den Etappen-Filter. Er existiert in fuenf Bereichen mit
// identischem Verhalten, deshalb laeuft hier fuer jeden Bereich derselbe
// Nutzerpfad ab: Auswahlfeld bedienen und pruefen, was danach in der Liste
// steht.
//
// Der Filter wird nicht ueber seine id gesucht, sondern ueber das, was der
// Nutzer sieht: es ist das Auswahlfeld mit der Beschriftung "Etappe", das die
// Moeglichkeit "Alle Etappen" anbietet. Das Zuordnungsfeld im Formular traegt
// dieselbe Beschriftung, bietet aber "— keine —" an.

const ETAPPEN_KEY = 'urlaub-app.etappen'

// Zwei Etappen: an Reims (id 1) haengt in jedem Bereich genau ein Eintrag,
// an Rouen (id 2) keiner.
const ETAPPEN = [
  { id: 1, name: 'Reims' },
  { id: 2, name: 'Rouen' },
]

const OHNE_ETAPPE = '__ohne-etappe__'

const BEREICHE = [
  {
    bereich: 'Buchungen',
    Komponente: Bookings,
    storageKey: 'urlaub-app.bookings',
    mitEtappe: {
      eintrag: { id: 11, titel: 'Hotel Reims', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: 1 },
      text: 'Hotel Reims',
    },
    ohneEtappe: {
      eintrag: { id: 12, titel: 'Mietwagen Ulm', typ: 'Mietwagen', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
      text: 'Mietwagen Ulm',
    },
    leerText: 'Keine Buchungen für diese Etappe.',
  },
  {
    bereich: 'Reiseroute',
    Komponente: Route,
    storageKey: 'urlaub-app.route',
    mitEtappe: {
      eintrag: { id: 21, von: 'Ulm', nach: 'Reims', datum: '', distanz: '', notiz: '', link: '', etappeId: 1 },
      text: 'Ulm → Reims',
    },
    ohneEtappe: {
      eintrag: { id: 22, von: 'Troyes', nach: 'Ulm', datum: '', distanz: '', notiz: '', link: '', etappeId: '' },
      text: 'Troyes → Ulm',
    },
    leerText: 'Keine Fahrten für diese Etappe.',
  },
  {
    bereich: 'Sehenswürdigkeiten',
    Komponente: Sightseeing,
    storageKey: 'urlaub-app.sightseeing',
    mitEtappe: {
      eintrag: { id: 31, titel: 'Kathedrale Notre-Dame', ort: '', kategorie: '', notiz: '', link: '', status: 'geplant', etappeId: 1 },
      text: 'Kathedrale Notre-Dame',
    },
    ohneEtappe: {
      eintrag: { id: 32, titel: 'Ulmer Münster', ort: '', kategorie: '', notiz: '', link: '', status: 'geplant', etappeId: '' },
      text: 'Ulmer Münster',
    },
    leerText: 'Keine Sehenswürdigkeiten für diese Etappe.',
  },
  {
    bereich: 'Events',
    Komponente: Events,
    storageKey: 'urlaub-app.events',
    mitEtappe: {
      eintrag: { id: 41, titel: 'Weinprobe', datum: '', ort: '', kontakt: '', status: 'geplant', notiz: '', link: '', etappeId: 1 },
      text: 'Weinprobe',
    },
    ohneEtappe: {
      eintrag: { id: 42, titel: 'Stadtfest', datum: '', ort: '', kontakt: '', status: 'geplant', notiz: '', link: '', etappeId: '' },
      text: 'Stadtfest',
    },
    leerText: 'Keine Events für diese Etappe.',
  },
  {
    bereich: 'Restaurants',
    Komponente: Restaurants,
    storageKey: 'urlaub-app.restaurants',
    mitEtappe: {
      eintrag: { id: 51, name: 'Brasserie du Boulingrin', ort: '', kueche: '', reservierung: '', kontakt: '', notiz: '', link: '', etappeId: 1 },
      text: 'Brasserie du Boulingrin',
    },
    ohneEtappe: {
      eintrag: { id: 52, name: 'Zunfthaus', ort: '', kueche: '', reservierung: '', kontakt: '', notiz: '', link: '', etappeId: '' },
      text: 'Zunfthaus',
    },
    leerText: 'Keine Restaurants für diese Etappe.',
  },
]

/**
 * Das Filter-Auswahlfeld anhand dessen, was der Nutzer darin liest.
 */
function filterAuswahlfeld() {
  const kandidaten = screen.getAllByLabelText('Etappe')
  const filter = kandidaten.find((el) =>
    [...el.options].some((option) => option.textContent === 'Alle Etappen'),
  )
  if (!filter) {
    throw new Error('Kein Auswahlfeld mit der Moeglichkeit "Alle Etappen" gefunden.')
  }
  return filter
}

describe.each(BEREICHE)(
  'Etappen-Filter im Bereich $bereich',
  ({ Komponente, storageKey, mitEtappe, ohneEtappe, leerText }) => {
    function seed() {
      window.localStorage.setItem(ETAPPEN_KEY, JSON.stringify(ETAPPEN))
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([mitEtappe.eintrag, ohneEtappe.eintrag]),
      )
    }

    it('Nutzerpfad: ohne Auswahl sind alle Eintraege sichtbar', () => {
      seed()
      render(<Komponente />)

      expect(filterAuswahlfeld().value).toBe('')
      expect(screen.getByText(mitEtappe.text)).toBeTruthy()
      expect(screen.getByText(ohneEtappe.text)).toBeTruthy()
      expect(screen.queryByText(leerText)).toBeNull()
    })

    it('Nutzerpfad: Etappe waehlen -> nur die zugeordneten Eintraege bleiben sichtbar', async () => {
      seed()
      const user = userEvent.setup()
      render(<Komponente />)

      await user.selectOptions(filterAuswahlfeld(), '1')

      expect(screen.getByText(mitEtappe.text)).toBeTruthy()
      expect(screen.queryByText(ohneEtappe.text)).toBeNull()
    })

    it('Nutzerpfad: "Ohne Etappe" waehlen -> nur die nicht zugeordneten Eintraege bleiben sichtbar', async () => {
      seed()
      const user = userEvent.setup()
      render(<Komponente />)

      await user.selectOptions(filterAuswahlfeld(), OHNE_ETAPPE)

      expect(screen.getByText(ohneEtappe.text)).toBeTruthy()
      expect(screen.queryByText(mitEtappe.text)).toBeNull()
    })

    it('Nutzerpfad: Etappe ohne Eintraege waehlen -> verstaendliche Leermeldung statt leerer Liste', async () => {
      seed()
      const user = userEvent.setup()
      render(<Komponente />)

      await user.selectOptions(filterAuswahlfeld(), '2')

      expect(screen.getByText(leerText)).toBeTruthy()
      expect(screen.queryByText(mitEtappe.text)).toBeNull()
      expect(screen.queryByText(ohneEtappe.text)).toBeNull()
    })

    it('Nutzerpfad: Filter zuruecksetzen -> alle Eintraege wieder da, Daten unveraendert', async () => {
      seed()
      const user = userEvent.setup()
      render(<Komponente />)

      await user.selectOptions(filterAuswahlfeld(), '1')
      await user.selectOptions(filterAuswahlfeld(), '')

      expect(screen.getByText(mitEtappe.text)).toBeTruthy()
      expect(screen.getByText(ohneEtappe.text)).toBeTruthy()

      // Filtern ist reine Anzeige - es darf nichts loeschen.
      const gespeichert = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
      expect(gespeichert).toHaveLength(2)
    })
  },
)

describe('Etappen-Filter erscheint nur, wenn es Etappen gibt', () => {
  it('Nutzerpfad: ohne angelegte Etappen wird kein Filter angeboten', () => {
    window.localStorage.setItem(
      'urlaub-app.bookings',
      JSON.stringify([
        { id: 11, titel: 'Hotel Reims', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
      ]),
    )
    render(<Bookings />)

    expect(screen.getByText('Hotel Reims')).toBeTruthy()
    const mitFilterMoeglichkeit = screen
      .getAllByLabelText('Etappe')
      .filter((el) => [...el.options].some((o) => o.textContent === 'Alle Etappen'))
    expect(mitFilterMoeglichkeit).toHaveLength(0)
  })
})
