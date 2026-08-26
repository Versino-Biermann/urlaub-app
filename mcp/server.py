"""FastMCP-Server (stdio) fuer die Urlaub-App.

Schreib-Pfad der Architektur: Dieser Server liest und schreibt die Datenbank -
dieselbe, aus der auch die App liest. Bis zum Umbau am 2026-08-26 war
``public/data.json`` die Quelle; seit dem Frontend-Umbau liest die App diese
Datei nicht mehr, Eintraege ueber den MCP-Weg gingen also ins Leere.

``public/data.json`` bleibt bestehen, aber als Sicherung statt als Quelle:
``publish`` exportiert den aktuellen Datenbankstand in die Datei und pusht sie
ins GitHub-Repo. Damit friert sie nicht still auf einem alten Stand ein und
taugt weiterhin als Backup-Import.

Der Server importiert die reine Datenlogik aus :mod:`store` (das keine
MCP-SDK kennt und separat mit pytest getestet wird).

Das Schreibgeheimnis kommt ausschliesslich aus der Umgebungsvariable
URLAUB_SCHREIBGEHEIMNIS. Fehlt sie, meldet der Server das beim Start auf
stderr, und jeder Schreibversuch antwortet sofort mit Klartext statt spaeter
mit einem Berechtigungsfehler der Datenbank.

Getestet gegen mcp==1.28.1 (FastMCP, API: mcp.server.fastmcp.FastMCP,
@mcp.tool(), mcp.run(transport="stdio")).
"""

from __future__ import annotations

import os
import subprocess
import sys
from typing import Any

from mcp.server.fastmcp import FastMCP

import store

# ---------------------------------------------------------------------------
# Pfad-Aufloesung
# ---------------------------------------------------------------------------
# DATA_PATH ist seit dem Umbau nur noch das Export-Ziel der Sicherung,
# relativ zur server.py: mcp/ -> ../public/data.json
# Per Env-Var URLAUB_DATA_PATH ueberschreibbar (z.B. fuer Tests/andere Umgebung).
_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.environ.get(
    "URLAUB_DATA_PATH",
    os.path.normpath(os.path.join(_HERE, "..", "public", "data.json")),
)
# Repo-Root = Parent von public/
REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(DATA_PATH), ".."))

# Timeout pro git-Aufruf in publish(). Ein MCP-Tool darf nie unbegrenzt
# blockieren: haengende git-Prozesse (z.B. pCloud-I/O-Blockade auf P:)
# wuerden den Tool-Call sonst endlos offen halten.
GIT_TIMEOUT_S = 60


def pruefe_schreibzugang() -> str:
    """Meldet beim Start, ob der Schreibzugang eingerichtet ist.

    Gibt die Klartext-Meldung zurueck, wenn das Schreibgeheimnis fehlt, sonst
    einen leeren String. Der Server startet trotzdem: Lesen (get_overview)
    funktioniert auch ohne Geheimnis, und ein Abbruch wuerde diese Faehigkeit
    grundlos mitnehmen. Jeder Schreibversuch wird stattdessen sofort mit
    derselben Meldung abgewiesen.
    """
    if store.hat_geheimnis():
        return ""
    return store.MELDUNG_GEHEIMNIS_FEHLT


mcp = FastMCP(
    name="urlaub-app",
    instructions=(
        "Schreib-Pfad fuer die Urlaub-App. Trage von Christof formlos "
        "gelieferte Reise-Infos in die richtige Kategorie ein "
        "(etappen, bookings, route, sightseeing, events, restaurants). "
        "Sammle mehrere Eintraege und veroeffentliche sie am Ende mit "
        "einem einzigen publish()-Aufruf. Bei add_*-Tools mit etappe-Arg: "
        "ist die Etappe nicht eindeutig, wird NICHT angelegt, sondern ein "
        "Hinweis mit Kandidaten zurueckgegeben."
    ),
)


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------


def _add_with_etappe(kategorie: str, felder: dict[str, Any], etappe: str) -> dict:
    """Gemeinsame Logik fuer add_*-Tools mit etappe-Argument.

    Ist ``etappe`` nicht leer und nicht eindeutig aufloesbar, wird NICHTS
    angelegt; stattdessen kommt ein Hinweis + Kandidaten zurueck, damit der
    Aufrufer entscheidet.

    Die Etappen werden nur dann aus der Datenbank geholt, wenn ueberhaupt eine
    Etappe genannt wurde - ohne Argument spart das eine Abfrage.
    """
    etappe_id = ""
    try:
        if (etappe or "").strip():
            data = store.empty_data()
            data["data"]["etappen"] = store.liste_lesen("etappen")
            etappe_id, hinweis = store.resolve_etappe_arg(data, etappe)
            if hinweis:
                return {
                    "status": "rueckfrage",
                    "hinweis": hinweis,
                    "eintrag": None,
                }
        felder["etappeId"] = etappe_id
        entry = store.add_entry(kategorie, felder)
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    return {
        "status": "ok",
        "hinweis": f"{kategorie}-Eintrag angelegt (id {entry['id']}).",
        "eintrag": entry,
    }


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def get_overview() -> dict:
    """Zeigt den aktuellen Stand der Reisedaten.

    Gibt je Kategorie die Anzahl der Eintraege, die Liste der Etappen
    (name + id) und je Kategorie die Titel/Namen der Eintraege zurueck,
    damit der Aufrufer sieht, was schon erfasst ist.
    """
    try:
        data = store.load_data()
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc)}
    d = data["data"]
    counts = {cat: len(d[cat]) for cat in store.CATEGORIES}

    etappen = [{"name": e.get("name", ""), "id": str(e.get("id"))} for e in d["etappen"]]

    def _label(entry: dict) -> str:
        return entry.get("titel") or entry.get("name") or (
            f"{entry.get('von', '')} -> {entry.get('nach', '')}"
            if entry.get("von") or entry.get("nach")
            else entry.get("id", "")
        )

    titles = {cat: [_label(e) for e in d[cat]] for cat in store.CATEGORIES}

    return {
        "status": "ok",
        "updatedAt": data.get("updatedAt"),
        "counts": counts,
        "etappen": etappen,
        "titel": titles,
        "quelle": store.DB_URL,
        "schreibzugang": "fehlt" if pruefe_schreibzugang() else "eingerichtet",
        "sicherung_pfad": DATA_PATH,
    }


@mcp.tool()
def add_etappe(
    name: str,
    vonDatum: str = "",
    bisDatum: str = "",
    notiz: str = "",
    link: str = "",
) -> dict:
    """Legt eine neue Reise-Etappe an (z.B. eine Stadt/ein Abschnitt).

    name ist Pflicht. vonDatum/bisDatum als ISO-Datum (YYYY-MM-DD) oder "".
    link: optionale URL (z.B. Buchungsseite), leer = kein Link.
    """
    try:
        entry = store.add_entry(
            "etappen",
            {
                "name": name,
                "vonDatum": vonDatum,
                "bisDatum": bisDatum,
                "notiz": notiz,
                "link": link,
            },
        )
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    return {
        "status": "ok",
        "hinweis": f"Etappe '{name}' angelegt (id {entry['id']}).",
        "eintrag": entry,
    }


@mcp.tool()
def add_buchung(
    titel: str,
    typ: str,
    datum: str = "",
    checkIn: str = "",
    checkOut: str = "",
    notiz: str = "",
    link: str = "",
    etappe: str = "",
) -> dict:
    """Legt eine Buchung an (Flug, Unterkunft, Mietwagen oder Transfer).

    typ muss einer von: Flug, Unterkunft, Mietwagen, Transfer sein.
    Bei typ=Unterkunft checkIn/checkOut nutzen, sonst datum.
    link: optionale URL (z.B. Booking.com-Buchung), leer = kein Link.
    etappe: Name ODER id einer bestehenden Etappe; leer = keine Zuordnung.
    Ist die Etappe nicht eindeutig, wird nichts angelegt (Rueckfrage).
    """
    return _add_with_etappe(
        "bookings",
        {
            "titel": titel,
            "typ": typ,
            "datum": datum,
            "checkIn": checkIn,
            "checkOut": checkOut,
            "notiz": notiz,
            "link": link,
        },
        etappe,
    )


@mcp.tool()
def add_fahrt(
    von: str,
    nach: str,
    datum: str = "",
    distanz: str = "",
    notiz: str = "",
    link: str = "",
    etappe: str = "",
) -> dict:
    """Legt einen Reiseroute-Abschnitt (eine Fahrt von A nach B) an.

    von/nach sind Pflicht. distanz als freier Text (z.B. '120 km').
    link: optionale URL (z.B. Ticket/Fahrplan), leer = kein Link.
    etappe: Name ODER id einer bestehenden Etappe; leer = keine Zuordnung.
    """
    return _add_with_etappe(
        "route",
        {
            "von": von,
            "nach": nach,
            "datum": datum,
            "distanz": distanz,
            "notiz": notiz,
            "link": link,
        },
        etappe,
    )


@mcp.tool()
def add_event(
    titel: str,
    datum: str = "",
    ort: str = "",
    kontakt: str = "",
    status: str = "geplant",
    notiz: str = "",
    link: str = "",
    etappe: str = "",
) -> dict:
    """Legt ein Event/eine Aktivitaet an (z.B. Stadtfuehrung, Konzert).

    status: geplant oder gebucht.
    link: optionale URL (z.B. Ticketshop), leer = kein Link.
    etappe: Name ODER id einer bestehenden Etappe; leer = keine Zuordnung.
    """
    return _add_with_etappe(
        "events",
        {
            "titel": titel,
            "datum": datum,
            "ort": ort,
            "kontakt": kontakt,
            "status": status,
            "notiz": notiz,
            "link": link,
        },
        etappe,
    )


@mcp.tool()
def add_restaurant(
    name: str,
    ort: str = "",
    kueche: str = "",
    reservierung: str = "",
    kontakt: str = "",
    notiz: str = "",
    link: str = "",
    etappe: str = "",
) -> dict:
    """Legt ein Restaurant an.

    name ist Pflicht. kueche z.B. 'italienisch'. reservierung als freier
    Text (z.B. 'Tisch 20 Uhr' oder Datum).
    link: optionale URL (z.B. Restaurant-Website), leer = kein Link.
    etappe: Name ODER id einer bestehenden Etappe; leer = keine Zuordnung.
    """
    return _add_with_etappe(
        "restaurants",
        {
            "name": name,
            "ort": ort,
            "kueche": kueche,
            "reservierung": reservierung,
            "kontakt": kontakt,
            "notiz": notiz,
            "link": link,
        },
        etappe,
    )


@mcp.tool()
def add_sehenswuerdigkeit(
    titel: str,
    ort: str = "",
    kategorie: str = "",
    status: str = "geplant",
    notiz: str = "",
    link: str = "",
    etappe: str = "",
) -> dict:
    """Legt eine Sehenswuerdigkeit an.

    status: geplant oder besucht. kategorie z.B. 'Museum', 'Kirche'.
    link: optionale URL (z.B. Website/Tickets), leer = kein Link.
    etappe: Name ODER id einer bestehenden Etappe; leer = keine Zuordnung.
    """
    return _add_with_etappe(
        "sightseeing",
        {
            "titel": titel,
            "ort": ort,
            "kategorie": kategorie,
            "status": status,
            "notiz": notiz,
            "link": link,
        },
        etappe,
    )


@mcp.tool()
def update_eintrag(kategorie: str, id: str, felder: dict) -> dict:
    """Aendert einen bestehenden Eintrag (Merge der gelieferten Felder).

    kategorie: etappen, bookings, route, sightseeing, events oder restaurants.
    id: die String-id des Eintrags. felder: dict der zu aendernden Felder.
    Enum-Felder (typ/status) werden validiert. id bleibt unveraendert.
    """
    try:
        entry = store.update_entry(kategorie, id, felder or {})
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    return {
        "status": "ok",
        "hinweis": f"{kategorie}-Eintrag {id} aktualisiert.",
        "eintrag": entry,
    }


@mcp.tool()
def delete_eintrag(kategorie: str, id: str) -> dict:
    """Loescht einen Eintrag per id.

    kategorie: etappen, bookings, route, sightseeing, events oder restaurants.
    Gibt den geloeschten Eintrag zurueck.
    """
    try:
        entry = store.delete_entry(kategorie, id)
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    return {
        "status": "ok",
        "hinweis": f"{kategorie}-Eintrag {id} geloescht.",
        "eintrag": entry,
    }


@mcp.tool()
def publish(message: str = "Update Reisedaten") -> dict:
    """Sichert den Datenbankstand nach public/data.json und pusht sie.

    Seit dem Datenbank-Umbau ist das ein Sicherungswerkzeug, kein
    Veroeffentlichungsweg mehr: die App liest ihre Daten direkt aus der
    Datenbank, ein Push aendert an dem, was Christof sieht, nichts. Der Zweck
    ist, die Daten nicht nur an einer Stelle liegen zu haben.

    Ablauf: Datenbank auslesen, im alten data.json-Format schreiben,
    AUSSCHLIESSLICH diese Datei committen und den aktuellen Branch (HEAD)
    nach origin pushen.

    Fehler werden als Klartext zurueckgegeben.
    """
    rel_data = os.path.relpath(DATA_PATH, REPO_ROOT).replace("\\", "/")

    steps_vorab: list[str] = []
    try:
        gesichert = store.export_datei(DATA_PATH)
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "schritte": steps_vorab}
    except OSError as exc:
        return {
            "status": "fehler",
            "hinweis": f"Sicherungsdatei nicht schreibbar: {exc}",
            "schritte": steps_vorab,
        }
    anzahl = sum(len(gesichert["data"][cat]) for cat in store.CATEGORIES)
    steps_vorab.append(f"{rel_data} aus der Datenbank geschrieben ({anzahl} Eintraege)")

    def _git(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_S,
        )

    steps: list[str] = list(steps_vorab)

    try:
        add = _git("add", rel_data)
        if add.returncode != 0:
            return {
                "status": "fehler",
                "hinweis": f"git add fehlgeschlagen: {add.stderr.strip()}",
                "schritte": steps,
            }
        steps.append(f"git add {rel_data}")

        # Sprachunabhaengige Pruefung statt String-Match auf "nothing to commit":
        # returncode 0 = nichts gestaged, 1 = Aenderungen gestaged, >1 = Fehler.
        staged = _git("diff", "--cached", "--quiet", "--", rel_data)
        if staged.returncode not in (0, 1):
            return {
                "status": "fehler",
                "hinweis": f"git diff --cached fehlgeschlagen: {staged.stderr.strip()}",
                "schritte": steps,
            }

        if staged.returncode == 1:
            commit = _git("commit", "-m", message)
            if commit.returncode != 0:
                return {
                    "status": "fehler",
                    "hinweis": f"git commit fehlgeschlagen: {commit.stderr.strip() or commit.stdout.strip()}",
                    "schritte": steps,
                }
            steps.append(f"git commit -m {message!r}")
        else:
            # Nichts gestaged heisst nicht zwingend "nichts zu tun": ein
            # frueherer Lauf kann committet haben und erst am Push gescheitert
            # sein (Timeout/Netz). Dann liegt der Commit unveroeffentlicht vor
            # und der Push muss nachgeholt werden.
            ahead = _git("rev-list", "--count", "@{u}..HEAD")
            if ahead.returncode == 0 and ahead.stdout.strip() == "0":
                return {
                    "status": "nichts_zu_tun",
                    "hinweis": (
                        "Die Sicherung war schon auf dem Stand der Datenbank "
                        "und es liegt kein ungepushter Commit vor."
                    ),
                    "schritte": steps,
                }
            # returncode != 0 = kein Upstream konfiguriert, Ahead-Stand also
            # unbekannt. Dann lieber pushen: im Zweifel ist es ein No-Op.
            steps.append("commit uebersprungen (nichts gestaged, Push-Nachholversuch)")

        push = _git("push", "origin", "HEAD")
        if push.returncode != 0:
            return {
                "status": "fehler",
                "hinweis": (
                    f"git push fehlgeschlagen: {push.stderr.strip()}. "
                    f"Commit liegt lokal vor, aber nicht veroeffentlicht."
                ),
                "schritte": steps,
            }
        steps.append("git push origin HEAD")
    except subprocess.TimeoutExpired as exc:
        cmd = exc.cmd
        cmd_text = " ".join(cmd[1:]) if isinstance(cmd, (list, tuple)) else str(cmd)
        return {
            "status": "fehler",
            "hinweis": (
                f"git {cmd_text} Timeout nach {GIT_TIMEOUT_S}s - mutmasslich "
                f"Datei-/Netzblockade (pCloud?). Kein Schaden: data.json liegt "
                f"lokal vor."
            ),
            "schritte": steps,
        }

    return {
        "status": "ok",
        "hinweis": (
            f"Sicherung von {anzahl} Eintraegen in {rel_data} gepusht. Die App "
            f"selbst liest weiterhin direkt aus der Datenbank."
        ),
        "schritte": steps,
    }


if __name__ == "__main__":
    # Fehlender Schreibzugang wird beim Start gemeldet, nicht erst beim ersten
    # abgewiesenen Schreibvorgang. stderr, damit die stdio-Verbindung zum
    # MCP-Client sauber bleibt - der Client zeigt das in seinem Server-Log.
    _meldung = pruefe_schreibzugang()
    if _meldung:
        print(f"urlaub-app MCP: {_meldung}", file=sys.stderr, flush=True)

    # stdio-Transport (Standard fuer lokale MCP-Server in Claude Code).
    mcp.run(transport="stdio")
