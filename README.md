# La Grande Virée

Web-basierter Urlaubs-Begleiter (Grundgerüst). Erfasst und speichert:

- **Buchungen** (Flug, Hotel, Mietwagen, Transfer) mit Titel, Typ, Datum und Notiz
- **Sehenswürdigkeiten** mit Titel, Ort, Kategorie, Notiz und Status (geplant / besucht)

Alle Daten werden im `localStorage` des Browsers gespeichert und überstehen einen Seiten-Reload.

## Tech-Stack

- [Vite](https://vite.dev/)
- [React](https://react.dev/) (JavaScript, kein TypeScript)
- Plain CSS, keine zusätzlichen UI-Bibliotheken

## Installation

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

Startet den lokalen Entwicklungsserver (Standard: http://localhost:5173).

## Build

```bash
npm run build
```

Erzeugt einen produktionsreifen Build im Ordner `dist/`.

## Projektstruktur

```
src/
  components/
    Navigation.jsx    Umschalten zwischen Buchungen und Sehenswürdigkeiten
    Bookings.jsx       Erfassung & Anzeige von Buchungen (localStorage)
    Sightseeing.jsx    Erfassung & Anzeige von Sehenswürdigkeiten (localStorage)
  App.jsx              Haupt-Layout, Navigation-State
  main.jsx             Einstiegspunkt
```

## Scope

Dies ist ein lokales Grundgerüst ohne Backend, ohne Authentifizierung, ohne Deployment
und ohne externe APIs (Karten, Wetter etc.).
