"""Reine Datenlogik fuer die Urlaub-App.

Dieses Modul kapselt das Lesen, Schreiben und Manipulieren von
``public/data.json``. Es importiert BEWUSST NICHT die MCP-SDK, damit
die Unit-Tests (pytest) ohne installierte SDK laufen.

Datenvertrag (public/data.json)::

    {
      "app": "urlaub-app",
      "version": 1,
      "updatedAt": <iso oder null>,
      "data": {
        "etappen": [], "bookings": [], "route": [],
        "sightseeing": [], "events": [], "restaurants": []
      }
    }

Die Feldnamen der Eintraege muessen exakt mit den React-Komponenten
uebereinstimmen, sonst rendert die App die Werte nicht.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
import uuid
from datetime import datetime, timezone
from typing import Any

APP_NAME = "urlaub-app"
APP_VERSION = 1

# Reihenfolge = Render-Reihenfolge in der App; Keys muessen exakt stimmen.
CATEGORIES = ("etappen", "bookings", "route", "sightseeing", "events", "restaurants")

# Feld-Templates je Kategorie. "id" wird separat vergeben (uuid4-hex).
# Fehlende optionale Felder werden mit "" gefuellt, NIE weggelassen.
CATEGORY_TEMPLATES: dict[str, dict[str, str]] = {
    "etappen": {
        "name": "",
        "vonDatum": "",
        "bisDatum": "",
        "notiz": "",
        "link": "",
    },
    "bookings": {
        "titel": "",
        "typ": "",
        "datum": "",
        "checkIn": "",
        "checkOut": "",
        "notiz": "",
        "link": "",
        "etappeId": "",
    },
    "route": {
        "von": "",
        "nach": "",
        "datum": "",
        "distanz": "",
        "notiz": "",
        "link": "",
        "etappeId": "",
    },
    "sightseeing": {
        "titel": "",
        "ort": "",
        "kategorie": "",
        "notiz": "",
        "link": "",
        "status": "",
        "etappeId": "",
    },
    "events": {
        "titel": "",
        "datum": "",
        "ort": "",
        "kontakt": "",
        "status": "",
        "notiz": "",
        "link": "",
        "etappeId": "",
    },
    "restaurants": {
        "name": "",
        "ort": "",
        "kueche": "",
        "reservierung": "",
        "kontakt": "",
        "notiz": "",
        "link": "",
        "etappeId": "",
    },
}

# Erlaubte Enum-Werte je (Kategorie, Feld). Leerwert "" ist immer erlaubt.
ENUMS: dict[tuple[str, str], tuple[str, ...]] = {
    ("bookings", "typ"): ("Flug", "Unterkunft", "Mietwagen", "Transfer"),
    ("sightseeing", "status"): ("geplant", "besucht"),
    ("events", "status"): ("geplant", "gebucht"),
}


# Retry fuer den atomaren Rename in save_data(). Auf P: (pCloud) sperrt der
# Sync-Client die Zieldatei kurzzeitig, os.replace scheitert dann mit
# PermissionError ([WinError 5]); der naechste Versuch klappt.
REPLACE_RETRIES = 2
REPLACE_RETRY_DELAY_S = 0.5


def _replace_with_retry(tmp_path: str, path: str) -> None:
    """os.replace mit kurzem Retry bei PermissionError (pCloud-Dateisperre).

    Nach ``REPLACE_RETRIES`` erfolglosen Wiederholungen wird der
    PermissionError unveraendert weitergegeben.
    """
    for versuch in range(REPLACE_RETRIES + 1):
        try:
            os.replace(tmp_path, path)
            return
        except PermissionError:
            if versuch == REPLACE_RETRIES:
                raise
            time.sleep(REPLACE_RETRY_DELAY_S)


class StoreError(Exception):
    """Fachlicher Fehler in der Datenlogik (unbekannte Kategorie, ungueltiger

    Enum-Wert, fehlende id usw.). Wird von server.py in Klartext uebersetzt.
    """


def _now_iso() -> str:
    """Aktueller Zeitstempel als ISO-8601 in UTC (mit 'Z')."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def empty_data() -> dict[str, Any]:
    """Frisches, leeres Datengeruest gemaess Datenvertrag."""
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "updatedAt": None,
        "data": {cat: [] for cat in CATEGORIES},
    }


def _ensure_shape(data: Any) -> dict[str, Any]:
    """Sorgt dafuer, dass ein geladenes dict die vollstaendige Struktur hat.

    Fehlende Top-Level- oder Kategorie-Keys werden ergaenzt, ohne
    vorhandene Eintraege zu verlieren.
    """
    if not isinstance(data, dict):
        return empty_data()
    result = empty_data()
    result["app"] = data.get("app", APP_NAME)
    result["version"] = data.get("version", APP_VERSION)
    result["updatedAt"] = data.get("updatedAt", None)
    incoming = data.get("data")
    if isinstance(incoming, dict):
        for cat in CATEGORIES:
            lst = incoming.get(cat)
            if isinstance(lst, list):
                result["data"][cat] = lst
    return result


def load_data(path: str) -> dict[str, Any]:
    """Laedt data.json. Fehlt die Datei oder ist sie kaputt, wird ein

    frisches leeres Geruest zurueckgegeben (nie eine Exception).
    """
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return empty_data()
    return _ensure_shape(raw)


def save_data(path: str, data: dict[str, Any]) -> dict[str, Any]:
    """Speichert data.json atomar (temp-Datei + os.replace, mit Retry).

    - setzt ``updatedAt`` auf aktuellen ISO-UTC-Zeitstempel
    - schreibt huebsch eingerueckt, ``ensure_ascii=False``
    - gibt das gespeicherte dict zurueck
    """
    data = _ensure_shape(data)
    data["updatedAt"] = _now_iso()

    target_dir = os.path.dirname(os.path.abspath(path))
    os.makedirs(target_dir, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=target_dir, prefix=".data-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        _replace_with_retry(tmp_path, path)
    except BaseException:
        # Temp-Datei bei Fehler aufraeumen, Original bleibt unangetastet.
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise
    return data


def _check_category(kategorie: str) -> None:
    if kategorie not in CATEGORY_TEMPLATES:
        raise StoreError(
            f"Unbekannte Kategorie '{kategorie}'. Erlaubt: "
            f"{', '.join(CATEGORIES)}"
        )


def _validate_enums(kategorie: str, felder: dict[str, Any]) -> None:
    for (cat, field), allowed in ENUMS.items():
        if cat != kategorie:
            continue
        value = felder.get(field, "")
        if value not in ("", *allowed):
            raise StoreError(
                f"Ungueltiger Wert '{value}' fuer {kategorie}.{field}. "
                f"Erlaubt: {', '.join(allowed)}"
            )


def _build_entry(
    kategorie: str, felder: dict[str, Any], entry_id: str
) -> dict[str, Any]:
    """Baut einen vollstaendigen Eintrag aus Template + gelieferten Feldern.

    Unbekannte Feldnamen werden ignoriert (nur Template-Felder + id).
    Fehlende Felder werden mit "" (aus Template) gefuellt.
    """
    template = CATEGORY_TEMPLATES[kategorie]
    entry: dict[str, Any] = {"id": entry_id}
    for field, default in template.items():
        value = felder.get(field, default)
        entry[field] = "" if value is None else value
    return entry


def add_entry(
    data: dict[str, Any],
    kategorie: str,
    felder: dict[str, Any],
    id: str | None = None,
) -> dict[str, Any]:
    """Fuegt einen neuen Eintrag hinzu und gibt ihn zurueck.

    - vergibt uuid4-hex-id, falls ``id`` None ist
    - fuellt fehlende Felder aus dem Template mit ""
    - validiert Kategorie und erlaubte Enum-Werte
    """
    _check_category(kategorie)
    _validate_enums(kategorie, felder)
    entry_id = id if id is not None else uuid.uuid4().hex
    entry = _build_entry(kategorie, felder, entry_id)
    data = _ensure_shape(data)
    data["data"][kategorie].append(entry)
    return entry


def find_entry(
    data: dict[str, Any], kategorie: str, id: str
) -> dict[str, Any] | None:
    """Findet einen Eintrag per String-id, oder None."""
    _check_category(kategorie)
    for entry in _ensure_shape(data)["data"][kategorie]:
        if str(entry.get("id")) == str(id):
            return entry
    return None


def update_entry(
    data: dict[str, Any],
    kategorie: str,
    id: str,
    felder: dict[str, Any],
) -> dict[str, Any]:
    """Merged ``felder`` in einen bestehenden Eintrag.

    Nur Template-Felder werden uebernommen; die id bleibt unveraendert.
    Wirft StoreError, wenn die id nicht existiert.
    """
    _check_category(kategorie)
    _validate_enums(kategorie, felder)
    entry = find_entry(data, kategorie, id)
    if entry is None:
        raise StoreError(
            f"Kein Eintrag in '{kategorie}' mit id '{id}' gefunden."
        )
    template = CATEGORY_TEMPLATES[kategorie]
    for field in template:
        if field in felder:
            value = felder[field]
            entry[field] = "" if value is None else value
    return entry


def delete_entry(data: dict[str, Any], kategorie: str, id: str) -> dict[str, Any]:
    """Loescht einen Eintrag per id und gibt ihn zurueck.

    Wirft StoreError, wenn die id nicht existiert.
    """
    _check_category(kategorie)
    data = _ensure_shape(data)
    lst = data["data"][kategorie]
    for i, entry in enumerate(lst):
        if str(entry.get("id")) == str(id):
            return lst.pop(i)
    raise StoreError(f"Kein Eintrag in '{kategorie}' mit id '{id}' gefunden.")


def find_etappe(
    data: dict[str, Any], text: str
) -> str | None | list[dict[str, str]]:
    """Sucht Etappen per case-insensitivem Substring-Match ueber name.

    Rueckgabe:
    - genau 1 Treffer  -> dessen id (str)
    - 0 Treffer        -> None
    - mehrere Treffer  -> Liste von {"name", "id"} als Kandidaten
    """
    needle = (text or "").strip().lower()
    if not needle:
        return None
    matches = [
        {"name": e.get("name", ""), "id": str(e.get("id"))}
        for e in _ensure_shape(data)["data"]["etappen"]
        if needle in str(e.get("name", "")).lower()
    ]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]["id"]
    return matches


def _etappen_liste(data: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {"name": e.get("name", ""), "id": str(e.get("id"))}
        for e in _ensure_shape(data)["data"]["etappen"]
    ]


def resolve_etappe_arg(data: dict[str, Any], etappe: str) -> tuple[str, str]:
    """Loest ein Etappe-Argument (Name ODER id) zu einer etappeId auf.

    Rueckgabe: ``(etappeId, hinweis)``.

    - leeres Argument            -> ("", "")  (bewusst keine Etappe)
    - exakte id-Uebereinstimmung -> (id, "")
    - eindeutiger Namens-Treffer -> (id, "")
    - mehrere Namens-Treffer     -> ("", Hinweis mit Kandidatenliste)
    - kein Treffer               -> ("", Hinweis mit vorhandenen Etappen)

    Legt NIE automatisch eine neue Etappe an.
    """
    arg = (etappe or "").strip()
    if not arg:
        return "", ""

    # 1) Exakte id-Uebereinstimmung hat Vorrang.
    for e in _etappen_liste(data):
        if e["id"] == arg:
            return e["id"], ""

    # 2) Namens-Match (case-insensitiv, Substring).
    result = find_etappe(data, arg)
    if isinstance(result, str):
        return result, ""
    if result is None:
        vorhanden = _etappen_liste(data)
        if vorhanden:
            liste = ", ".join(f"{e['name']} ({e['id']})" for e in vorhanden)
            hinweis = (
                f"Keine Etappe passt zu '{arg}'. Vorhandene Etappen: {liste}"
            )
        else:
            hinweis = (
                f"Keine Etappe passt zu '{arg}'. Es sind noch keine Etappen "
                f"angelegt."
            )
        return "", hinweis
    # Mehrere Kandidaten.
    liste = ", ".join(f"{e['name']} ({e['id']})" for e in result)
    hinweis = (
        f"'{arg}' ist nicht eindeutig. Passende Etappen: {liste}. "
        f"Bitte per id praezisieren."
    )
    return "", hinweis
