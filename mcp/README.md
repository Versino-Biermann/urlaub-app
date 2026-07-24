# Urlaub-App MCP-Server

Lokaler MCP-Server (Python, FastMCP, stdio) als **Schreib-Pfad** der Urlaub-App.

## Architektur

```
Christof liefert formlos Infos
        │
        ▼
Larry / Claude  ──ruft MCP-Tools──▶  server.py (FastMCP, stdio)
                                          │
                                          ▼
                              store.py  (reine Datenlogik)
                                          │
                                          ▼
                        public/data.json  (gemeinsame Datenquelle)
                                          │
                                     publish() → git push
                                          │
                                          ▼
                        GitHub Actions  → GitHub Pages (live)
```

Die App (Vite+React) lädt `public/data.json` beim Start. Der MCP-Server ist der
einzige schreibende Zugriff auf diese Datei.

## Dateien

| Datei | Zweck |
|---|---|
| `store.py` | Reine Datenlogik (laden/speichern/CRUD/Etappen-Auflösung). **Kein** MCP-SDK-Import → mit pytest ohne SDK testbar. |
| `server.py` | FastMCP-Server, definiert die Tools, stdio-Transport. |
| `tests/test_store.py` | pytest gegen `store.py` (nur temp-Dateien). |
| `requirements.txt` | `mcp` + `pytest`. |

## Setup

```bash
# im Ordner mcp/
py -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Tests ausführen

```bash
.venv\Scripts\python.exe -m pytest tests/ -v
```

Die Tests brauchen die MCP-SDK **nicht** und arbeiten ausschließlich auf
temporären Dateien — die echte `public/data.json` wird nie angefasst.

## Server starten (manueller Smoke-Test)

Der Server läuft über stdio und wird normalerweise **nicht** von Hand
gestartet, sondern von Claude Code als MCP-Server gespawnt. Ein reiner
Import-/Registrierungs-Check (ohne stdio zu blockieren):

```bash
.venv\Scripts\python.exe -c "import server; print(server.mcp.name)"
```

Direkter stdio-Lauf (blockiert, wartet auf MCP-Client — mit Strg+C beenden):

```bash
.venv\Scripts\python.exe server.py
```

## Datenpfad

`DATA_PATH` wird relativ zu `server.py` aufgelöst (`mcp/ → ../public/data.json`)
und kann per Umgebungsvariable `URLAUB_DATA_PATH` überschrieben werden (nützlich
für Tests/andere Umgebungen). Repo-Root = Parent von `public/`.

## In Claude Code registrieren

Eintrag in der `.mcp.json` (Registrierung macht Christof/Larry separat):

```json
{
  "mcpServers": {
    "urlaub-app": {
      "command": "P:\\01 GIT\\urlaub-app\\mcp\\.venv\\Scripts\\python.exe",
      "args": ["P:\\01 GIT\\urlaub-app\\mcp\\server.py"]
    }
  }
}
```

## Tools

| Tool | Zweck |
|---|---|
| `get_overview()` | Zeigt Anzahl je Kategorie, Etappen (name+id) und Titel je Kategorie. |
| `add_etappe(name, vonDatum, bisDatum, notiz)` | Reise-Etappe (Stadt/Abschnitt). |
| `add_buchung(titel, typ, datum, checkIn, checkOut, notiz, etappe)` | typ ∈ Flug/Unterkunft/Mietwagen/Transfer. |
| `add_fahrt(von, nach, datum, distanz, notiz, etappe)` | Reiseroute-Abschnitt. |
| `add_event(titel, datum, ort, kontakt, status, notiz, etappe)` | status ∈ geplant/gebucht. |
| `add_restaurant(name, ort, kueche, reservierung, kontakt, notiz, etappe)` | Restaurant. |
| `add_sehenswuerdigkeit(titel, ort, kategorie, status, notiz, etappe)` | status ∈ geplant/besucht. |
| `update_eintrag(kategorie, id, felder)` | Merge-Update eines Eintrags. |
| `delete_eintrag(kategorie, id)` | Eintrag löschen. |
| `publish(message)` | Committet **nur** `public/data.json` und pusht nach `origin/master`. |

**Etappe-Argument:** `etappe` akzeptiert einen Namen **oder** eine id. Ist der
Name nicht eindeutig oder unbekannt, wird **nichts** angelegt — stattdessen kommt
ein Hinweis mit Kandidaten zurück, damit der Aufrufer entscheidet. Es werden
**nie** automatisch neue Etappen erzeugt.

**publish ist bewusst getrennt** von den `add_*`-Tools: erst mehrere Einträge
sammeln, dann mit einem einzigen `publish()`-Aufruf veröffentlichen.
