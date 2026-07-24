"""FastMCP-Server (stdio) fuer die Urlaub-App.

Schreib-Pfad der Architektur: Dieser Server manipuliert
``public/data.json`` und kann sie per ``publish`` ins GitHub-Repo pushen.
GitHub Actions baut dann automatisch die GitHub-Pages-Seite.

Der Server importiert die reine Datenlogik aus :mod:`store` (das keine
MCP-SDK kennt und separat mit pytest getestet wird).

Getestet gegen mcp==1.28.1 (FastMCP, API: mcp.server.fastmcp.FastMCP,
@mcp.tool(), mcp.run(transport="stdio")).
"""

from __future__ import annotations

import os
import subprocess
from typing import Any

from mcp.server.fastmcp import FastMCP

import store

# ---------------------------------------------------------------------------
# Pfad-Aufloesung
# ---------------------------------------------------------------------------
# DATA_PATH relativ zur server.py: mcp/ -> ../public/data.json
# Per Env-Var URLAUB_DATA_PATH ueberschreibbar (z.B. fuer Tests/andere Umgebung).
_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.environ.get(
    "URLAUB_DATA_PATH",
    os.path.normpath(os.path.join(_HERE, "..", "public", "data.json")),
)
# Repo-Root = Parent von public/
REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(DATA_PATH), ".."))

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


def _load() -> dict[str, Any]:
    return store.load_data(DATA_PATH)


def _save(data: dict[str, Any]) -> dict[str, Any]:
    return store.save_data(DATA_PATH, data)


def _add_with_etappe(kategorie: str, felder: dict[str, Any], etappe: str) -> dict:
    """Gemeinsame Logik fuer add_*-Tools mit etappe-Argument.

    Ist ``etappe`` nicht leer und nicht eindeutig aufloesbar, wird NICHTS
    angelegt; stattdessen kommt ein Hinweis + Kandidaten zurueck, damit der
    Aufrufer entscheidet.
    """
    data = _load()
    etappe_id = ""
    if (etappe or "").strip():
        etappe_id, hinweis = store.resolve_etappe_arg(data, etappe)
        if hinweis:
            return {
                "status": "rueckfrage",
                "hinweis": hinweis,
                "eintrag": None,
            }
    felder["etappeId"] = etappe_id
    try:
        entry = store.add_entry(data, kategorie, felder)
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    _save(data)
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
    data = _load()
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
        "data_path": DATA_PATH,
    }


@mcp.tool()
def add_etappe(name: str, vonDatum: str = "", bisDatum: str = "", notiz: str = "") -> dict:
    """Legt eine neue Reise-Etappe an (z.B. eine Stadt/ein Abschnitt).

    name ist Pflicht. vonDatum/bisDatum als ISO-Datum (YYYY-MM-DD) oder "".
    """
    data = _load()
    try:
        entry = store.add_entry(
            data,
            "etappen",
            {"name": name, "vonDatum": vonDatum, "bisDatum": bisDatum, "notiz": notiz},
        )
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    _save(data)
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
    etappe: str = "",
) -> dict:
    """Legt eine Buchung an (Flug, Unterkunft, Mietwagen oder Transfer).

    typ muss einer von: Flug, Unterkunft, Mietwagen, Transfer sein.
    Bei typ=Unterkunft checkIn/checkOut nutzen, sonst datum.
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
    etappe: str = "",
) -> dict:
    """Legt einen Reiseroute-Abschnitt (eine Fahrt von A nach B) an.

    von/nach sind Pflicht. distanz als freier Text (z.B. '120 km').
    etappe: Name ODER id einer bestehenden Etappe; leer = keine Zuordnung.
    """
    return _add_with_etappe(
        "route",
        {"von": von, "nach": nach, "datum": datum, "distanz": distanz, "notiz": notiz},
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
    etappe: str = "",
) -> dict:
    """Legt ein Event/eine Aktivitaet an (z.B. Stadtfuehrung, Konzert).

    status: geplant oder gebucht.
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
    etappe: str = "",
) -> dict:
    """Legt ein Restaurant an.

    name ist Pflicht. kueche z.B. 'italienisch'. reservierung als freier
    Text (z.B. 'Tisch 20 Uhr' oder Datum).
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
    etappe: str = "",
) -> dict:
    """Legt eine Sehenswuerdigkeit an.

    status: geplant oder besucht. kategorie z.B. 'Museum', 'Kirche'.
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
    data = _load()
    try:
        entry = store.update_entry(data, kategorie, id, felder or {})
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    _save(data)
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
    data = _load()
    try:
        entry = store.delete_entry(data, kategorie, id)
    except store.StoreError as exc:
        return {"status": "fehler", "hinweis": str(exc), "eintrag": None}
    _save(data)
    return {
        "status": "ok",
        "hinweis": f"{kategorie}-Eintrag {id} geloescht.",
        "eintrag": entry,
    }


@mcp.tool()
def publish(message: str = "Update Reisedaten") -> dict:
    """Veroeffentlicht die aktuelle public/data.json ins GitHub-Repo.

    Committet AUSSCHLIESSLICH public/data.json und pusht nach origin/master.
    GitHub Actions baut danach automatisch die GitHub-Pages-Seite.

    Bewusst getrennt von den add_*-Tools: erst mehrere Eintraege sammeln,
    dann einmal veroeffentlichen. Fehler werden als Klartext zurueckgegeben.
    """
    rel_data = os.path.relpath(DATA_PATH, REPO_ROOT).replace("\\", "/")

    def _git(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )

    steps: list[str] = []

    add = _git("add", rel_data)
    if add.returncode != 0:
        return {
            "status": "fehler",
            "hinweis": f"git add fehlgeschlagen: {add.stderr.strip()}",
            "schritte": steps,
        }
    steps.append(f"git add {rel_data}")

    commit = _git("commit", "-m", message)
    if commit.returncode != 0:
        combined = (commit.stdout + commit.stderr).lower()
        if "nothing to commit" in combined or "clean" in combined:
            return {
                "status": "nichts_zu_tun",
                "hinweis": "Keine Aenderungen an data.json zum Veroeffentlichen.",
                "schritte": steps,
            }
        return {
            "status": "fehler",
            "hinweis": f"git commit fehlgeschlagen: {commit.stderr.strip() or commit.stdout.strip()}",
            "schritte": steps,
        }
    steps.append(f"git commit -m {message!r}")

    push = _git("push", "origin", "master")
    if push.returncode != 0:
        return {
            "status": "fehler",
            "hinweis": (
                f"git push fehlgeschlagen: {push.stderr.strip()}. "
                f"Commit liegt lokal vor, aber nicht veroeffentlicht."
            ),
            "schritte": steps,
        }
    steps.append("git push origin master")

    return {
        "status": "ok",
        "hinweis": (
            "public/data.json veroeffentlicht. GitHub Actions baut jetzt "
            "automatisch die Seite."
        ),
        "schritte": steps,
    }


if __name__ == "__main__":
    # stdio-Transport (Standard fuer lokale MCP-Server in Claude Code).
    mcp.run(transport="stdio")
