"""Reine Datenlogik fuer die Urlaub-App - Datenquelle ist die Datenbank.

Dieses Modul kapselt Lesen, Schreiben und Manipulieren der Reisedaten. Es
importiert BEWUSST NICHT die MCP-SDK, damit die Unit-Tests (pytest) ohne
installierte SDK laufen.

Umbau 2026-08-26: Bis dahin war ``public/data.json`` die Quelle. Seit dem
Frontend-Umbau liest und schreibt die App ausschliesslich die Datenbank, und
data.json wurde von der App nicht mehr gelesen - alles, was ueber den
MCP-Weg eingetragen wurde, ging ins Leere. Seit diesem Umbau spricht auch
dieses Modul die Datenbank an. Der Zugriffsweg (Adresse, Kopfzeilen,
Feldfilter, Kennungsformat) ist bewusst wortgleich zu ``src/db.js`` gehalten,
damit die beiden Schreibwege nicht auseinanderlaufen.

``public/data.json`` bleibt bestehen, aber in umgekehrter Rolle: sie ist
nicht mehr Quelle, sondern Sicherung. ``export_datei()`` schreibt den
aktuellen Datenbankstand im alten Format hinein, damit die Datei nicht still
auf einem alten Stand einfriert und weiterhin als Backup-Import taugt.

Datenvertrag der Sicherungsdatei (public/data.json) - unveraendert::

    {
      "app": "urlaub-app",
      "version": 1,
      "updatedAt": <iso oder null>,
      "data": {
        "etappen": [], "bookings": [], "route": [],
        "sightseeing": [], "events": [], "restaurants": []
      }
    }

Die Feldnamen der Eintraege muessen exakt mit den Spaltennamen der Datenbank
und den React-Komponenten uebereinstimmen, sonst rendert die App die Werte
nicht.
"""

from __future__ import annotations

import json
import os
import secrets
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

APP_NAME = "urlaub-app"
APP_VERSION = 1

# Reihenfolge = Render-Reihenfolge in der App; Keys muessen exakt stimmen.
CATEGORIES = ("etappen", "bookings", "route", "sightseeing", "events", "restaurants")

# Feld-Templates je Kategorie. "id" wird separat vergeben (siehe neue_kennung).
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

# Die Spalten, die je Liste angefordert und geschrieben werden. Wortgleich zu
# FELDER in src/db.js und zugleich Filter in BEIDE Richtungen:
#   Lesen:     nur diese Spalten kommen mit. Die Verwaltungsspalten
#              id_numerisch und aktualisiert_am bleiben aussen vor, die
#              Sicherungsdatei bekommt also exakt die alte Objektform.
#   Schreiben: nur diese Felder werden gesendet, damit ein gelesener Eintrag
#              gefahrlos zurueckgeschickt werden kann.
FELDER: dict[str, tuple[str, ...]] = {
    cat: ("id", *CATEGORY_TEMPLATES[cat].keys()) for cat in CATEGORIES
}


# ---------------------------------------------------------------------------
# Datenbank-Zugang
# ---------------------------------------------------------------------------

DB_URL = "https://yrsdfiskfpefzqgoscze.supabase.co"

# Oeffentlicher Lese-Schluessel. Er darf im Quelltext stehen: er erlaubt nur,
# was die Zeilenschutz-Regeln der Datenbank ohnehin jedem erlauben - lesen.
# Jeder Schreibvorgang verlangt zusaetzlich das Schreibgeheimnis, und das
# steht NICHT hier, sondern kommt aus der Umgebung.
DB_KEY = "sb_publishable_ZDpxCF_YHauqkktcx-z0_Q_paZnPWfi"

GEHEIMNIS_ENV = "URLAUB_SCHREIBGEHEIMNIS"
GEHEIMNIS_KOPFZEILE = "x-urlaub-schreibgeheimnis"

ZEITGRENZE_S = 20

MELDUNG_GEHEIMNIS_FEHLT = (
    f"Das Schreibgeheimnis fehlt: die Umgebungsvariable {GEHEIMNIS_ENV} ist "
    f"nicht gesetzt oder leer. Lesen funktioniert weiterhin, Schreiben nicht. "
    f"Variable setzen und den MCP-Server neu starten."
)

MELDUNG_GEHEIMNIS_ABGELEHNT = (
    f"Die Datenbank lehnt das Schreibgeheimnis ab. Der Wert in "
    f"{GEHEIMNIS_ENV} passt nicht zur Datenbank. Es wurde nichts gespeichert."
)


class StoreError(Exception):
    """Fachlicher Fehler in der Datenlogik (unbekannte Kategorie, ungueltiger

    Enum-Wert, fehlende id, abgewiesene Datenbank-Anfrage usw.). Wird von
    server.py in Klartext an den Aufrufer zurueckgegeben.
    """


def hat_geheimnis() -> bool:
    """Sagt, ob ein Schreibgeheimnis in der Umgebung steht - ohne es zu zeigen."""
    return bool(os.environ.get(GEHEIMNIS_ENV, "").strip())


def _geheimnis() -> str:
    """Liest das Schreibgeheimnis aus der Umgebung.

    Der Wert wird NIE geloggt, nie in eine Fehlermeldung geschrieben und nie
    in eine Datei ausgegeben. Fehlt er, gibt es sofort Klartext statt spaeter
    einen HTTP-403 aus der Datenbank.
    """
    wert = os.environ.get(GEHEIMNIS_ENV, "").strip()
    if not wert:
        raise StoreError(MELDUNG_GEHEIMNIS_FEHLT)
    return wert


def _kopfzeilen(mit_geheimnis: bool) -> dict[str, str]:
    kopf = {
        "apikey": DB_KEY,
        "Authorization": f"Bearer {DB_KEY}",
        "Content-Type": "application/json",
    }
    if mit_geheimnis:
        kopf[GEHEIMNIS_KOPFZEILE] = _geheimnis()
    return kopf


def _anfrage(
    pfad: str,
    methode: str = "GET",
    rumpf: Any = None,
    mit_geheimnis: bool = False,
    extra_kopf: dict[str, str] | None = None,
) -> Any:
    """Eine Anfrage an die Datenbank. Gibt die geparste Antwort oder None.

    Bewusst mit der Standardbibliothek (urllib) statt httpx: der Server laeuft
    synchron ueber stdio, braucht also keinen async-Client, und so kommt keine
    zusaetzliche Abhaengigkeit dazu.

    Fehler werden in StoreError mit Klartext uebersetzt. In keiner dieser
    Meldungen taucht das Schreibgeheimnis auf.
    """
    kopf = _kopfzeilen(mit_geheimnis)
    if extra_kopf:
        kopf.update(extra_kopf)

    daten = None
    if rumpf is not None:
        daten = json.dumps(rumpf, ensure_ascii=False).encode("utf-8")

    anfrage = urllib.request.Request(
        f"{DB_URL}/rest/v1/{pfad}", data=daten, headers=kopf, method=methode
    )

    try:
        with urllib.request.urlopen(anfrage, timeout=ZEITGRENZE_S) as antwort:
            roh = antwort.read().decode("utf-8")
    except urllib.error.HTTPError as fehler:
        if mit_geheimnis and fehler.code in (401, 403):
            raise StoreError(MELDUNG_GEHEIMNIS_ABGELEHNT) from None
        # Antworttext gekuerzt mitgeben: er hilft bei der Diagnose und kann
        # das Geheimnis nicht enthalten (es wird nur als Kopfzeile gesendet,
        # nie im Rumpf, und die Datenbank spiegelt keine Kopfzeilen).
        text = ""
        try:
            text = fehler.read().decode("utf-8", "replace")[:300].strip()
        except Exception:
            pass
        raise StoreError(
            f"Die Datenbank hat die Anfrage abgelehnt (HTTP {fehler.code}). "
            f"Es wurde nichts gespeichert. {text}".strip()
        ) from None
    except Exception:
        # Kein HTTP-Status: Netz weg oder Zeitgrenze gerissen. Die urspruengliche
        # Ausnahme wird bewusst nicht durchgereicht, damit keine Kopfzeilen aus
        # einem Traceback nach aussen gelangen koennen.
        raise StoreError(
            "Keine Verbindung zur Datenbank. Es wurde nichts gespeichert. "
            "Bitte spaeter erneut versuchen."
        ) from None

    if not roh:
        return None
    try:
        return json.loads(roh)
    except json.JSONDecodeError:
        raise StoreError(
            "Die Datenbank hat eine unlesbare Antwort geschickt."
        ) from None


# ---------------------------------------------------------------------------
# Kennungen
# ---------------------------------------------------------------------------

# Alphabet von JavaScripts Number.prototype.toString(36).
_KENNUNG_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
_KENNUNG_ZUFALL_LAENGE = 6


def neue_kennung() -> str:
    """Erzeugt eine Kennung im selben Format wie ``neueKennung`` in src/db.js.

    Aufbau: Zeitstempel in Millisekunden, Bindestrich, sechs Zufallszeichen
    aus [0-9a-z].

    Der Zeitstempel steht vorn, damit neue Eintraege in der nach "id"
    sortierten Abfrage chronologisch einsortiert werden. Der Zufallsanteil
    verhindert, dass zwei Schreibwege in derselben Millisekunde dieselbe
    Kennung erzeugen.

    Bewusster Unterschied zum Frontend: dort liefert Math.random den Zufall,
    hier secrets. Format, Alphabet und Laenge sind identisch - nur die Quelle
    der Zufallszahl ist die bessere.
    """
    zufall = "".join(
        secrets.choice(_KENNUNG_ALPHABET) for _ in range(_KENNUNG_ZUFALL_LAENGE)
    )
    return f"{int(time.time() * 1000)}-{zufall}"


# ---------------------------------------------------------------------------
# Sicherungsdatei (public/data.json)
# ---------------------------------------------------------------------------

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
    """Sorgt dafuer, dass ein dict die vollstaendige Struktur hat.

    Fehlende Top-Level- oder Kategorie-Keys werden ergaenzt, ohne vorhandene
    Eintraege zu verlieren.
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


def save_data(path: str, data: dict[str, Any]) -> dict[str, Any]:
    """Speichert die Sicherungsdatei atomar (temp-Datei + os.replace, mit Retry).

    - setzt ``updatedAt`` auf aktuellen ISO-UTC-Zeitstempel
    - schreibt huebsch eingerueckt, ``ensure_ascii=False`` (Umlaute bleiben
      als Umlaute in der Datei stehen)
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


def export_datei(path: str) -> dict[str, Any]:
    """Schreibt den aktuellen Datenbankstand in die Sicherungsdatei.

    Liest alle sechs Listen aus der Datenbank und legt sie im alten
    data.json-Format ab, damit die Datei weiterhin als Backup-Import taugt.
    """
    return save_data(path, load_data())


# ---------------------------------------------------------------------------
# Lesen
# ---------------------------------------------------------------------------


def liste_lesen(kategorie: str) -> list[dict[str, Any]]:
    """Liest eine Kategorie aus der Datenbank, nach id aufsteigend sortiert.

    Es kommen genau die Felder aus ``FELDER`` zurueck - die Verwaltungsspalten
    der Datenbank bleiben aussen vor.
    """
    _check_category(kategorie)
    spalten = ",".join(FELDER[kategorie])
    zeilen = _anfrage(f"{kategorie}?select={spalten}&order=id.asc")
    return zeilen if isinstance(zeilen, list) else []


def load_data() -> dict[str, Any]:
    """Laedt alle sechs Listen aus der Datenbank in das bekannte Geruest.

    ``updatedAt`` ist der Zeitpunkt dieses Abrufs, nicht der Zeitpunkt der
    letzten Aenderung - die Datenbank fuehrt Aenderungszeiten je Zeile in
    ``aktualisiert_am``, und diese Spalte wird bewusst nicht mitgelesen.
    """
    data = empty_data()
    for cat in CATEGORIES:
        data["data"][cat] = liste_lesen(cat)
    data["updatedAt"] = _now_iso()
    return data


# ---------------------------------------------------------------------------
# Pruefungen und Eintrags-Aufbau
# ---------------------------------------------------------------------------


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
    Fehlende Felder werden mit "" (aus Template) gefuellt, nie weggelassen.
    """
    template = CATEGORY_TEMPLATES[kategorie]
    entry: dict[str, Any] = {"id": entry_id}
    for field, default in template.items():
        value = felder.get(field, default)
        entry[field] = "" if value is None else value
    return entry


# ---------------------------------------------------------------------------
# Schreiben
# ---------------------------------------------------------------------------


def add_entry(
    kategorie: str,
    felder: dict[str, Any],
    id: str | None = None,
) -> dict[str, Any]:
    """Legt einen neuen Eintrag in der Datenbank an und gibt ihn zurueck.

    - vergibt eine Kennung im Frontend-Format, falls ``id`` None ist
    - fuellt fehlende Felder aus dem Template mit ""
    - validiert Kategorie und erlaubte Enum-Werte, bevor etwas gesendet wird
    - wirft StoreError, wenn die Datenbank das Anlegen nicht bestaetigt
    """
    _check_category(kategorie)
    _validate_enums(kategorie, felder)
    entry_id = id if id is not None else neue_kennung()
    entry = _build_entry(kategorie, felder, entry_id)
    spalten = ",".join(FELDER[kategorie])
    zeilen = _anfrage(
        f"{kategorie}?select={spalten}",
        methode="POST",
        rumpf=entry,
        mit_geheimnis=True,
        # Ohne diese Kopfzeile liefert die Datenbank einen leeren Rumpf zurueck.
        extra_kopf={"Prefer": "return=representation"},
    )
    if isinstance(zeilen, list) and zeilen:
        return zeilen[0]
    # Kein Rueckgabe-Datensatz trotz "Prefer: return=representation" heisst:
    # die Datenbank hat das Anlegen nicht bestaetigt. Frueher wurde hier der
    # lokal gebaute Eintrag zurueckgegeben - damit sah ein nicht bestaetigtes
    # Anlegen wie ein Erfolg aus, und der Aufrufer meldete "eingetragen",
    # obwohl unterwegs nichts angekommen war. update_entry und delete_entry
    # behandeln denselben Fall als Fehler; add_entry tut es jetzt auch.
    raise StoreError(
        f"Die Datenbank hat das Anlegen in '{kategorie}' nicht bestaetigt. "
        f"Der Eintrag gilt als NICHT gespeichert."
    )


def find_entry(kategorie: str, id: str) -> dict[str, Any] | None:
    """Holt einen Eintrag per Kennung aus der Datenbank, oder None."""
    _check_category(kategorie)
    spalten = ",".join(FELDER[kategorie])
    zeilen = _anfrage(
        f"{kategorie}?id=eq.{urllib.parse.quote(str(id), safe='')}"
        f"&select={spalten}&limit=1"
    )
    if isinstance(zeilen, list) and zeilen:
        return zeilen[0]
    return None


def update_entry(
    kategorie: str,
    id: str,
    felder: dict[str, Any],
) -> dict[str, Any]:
    """Merged ``felder`` in einen bestehenden Eintrag der Datenbank.

    Nur Template-Felder werden uebernommen; die Kennung bleibt unveraendert.
    Wirft StoreError, wenn die Kennung nicht existiert.
    """
    _check_category(kategorie)
    _validate_enums(kategorie, felder)
    template = CATEGORY_TEMPLATES[kategorie]
    aenderung: dict[str, Any] = {}
    for field in template:
        if field in felder:
            value = felder[field]
            aenderung[field] = "" if value is None else value
    if not aenderung:
        entry = find_entry(kategorie, id)
        if entry is None:
            raise StoreError(
                f"Kein Eintrag in '{kategorie}' mit id '{id}' gefunden."
            )
        return entry

    spalten = ",".join(FELDER[kategorie])
    zeilen = _anfrage(
        f"{kategorie}?id=eq.{urllib.parse.quote(str(id), safe='')}"
        f"&select={spalten}",
        methode="PATCH",
        rumpf=aenderung,
        mit_geheimnis=True,
        extra_kopf={"Prefer": "return=representation"},
    )
    if isinstance(zeilen, list) and zeilen:
        return zeilen[0]
    raise StoreError(f"Kein Eintrag in '{kategorie}' mit id '{id}' gefunden.")


def delete_entry(kategorie: str, id: str) -> dict[str, Any]:
    """Loescht einen Eintrag per Kennung und gibt den geloeschten Eintrag zurueck.

    Wirft StoreError, wenn die Kennung nicht existiert.
    """
    _check_category(kategorie)
    spalten = ",".join(FELDER[kategorie])
    zeilen = _anfrage(
        f"{kategorie}?id=eq.{urllib.parse.quote(str(id), safe='')}"
        f"&select={spalten}",
        methode="DELETE",
        mit_geheimnis=True,
        extra_kopf={"Prefer": "return=representation"},
    )
    if isinstance(zeilen, list) and zeilen:
        return zeilen[0]
    raise StoreError(f"Kein Eintrag in '{kategorie}' mit id '{id}' gefunden.")


# ---------------------------------------------------------------------------
# Etappen-Aufloesung (arbeitet auf einem bereits geladenen Geruest)
# ---------------------------------------------------------------------------


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
