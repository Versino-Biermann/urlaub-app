"""pytest gegen store.py (reine Datenlogik, keine MCP-SDK noetig).

Umbau 2026-08-26: store.py holt seine Daten nicht mehr aus public/data.json,
sondern aus der Datenbank. Entsprechend hat sich der Zuschnitt der Tests
verschoben.

Was hier nachgebildet wird und was nicht:

  Nachgebildet ist AUSSCHLIESSLICH die Gegenstelle, also der HTTP-Transport
  (``urllib.request.urlopen``). Alles, was zur Datenschicht gehoert, laeuft
  echt: Kategorie- und Enum-Pruefung, Feldfilter, Kennungs-Erzeugung, Aufbau
  von Adresse und Kopfzeilen, Uebersetzung der Antworten und Fehler. Die
  Tests pruefen also die echte Datenschicht gegen eine kontrollierte
  Gegenstelle - nicht die Nachbildung gegen sich selbst.

  Der Real-Pfad-Run gegen die echte Datenbank ist davon getrennt und im
  Bericht dokumentiert.

Die Tests zum Datei-Schreiben (atomarer Rename, Temp-Reste, Retry bei
pCloud-Sperren, Umlaute, Einrueckung) sind geblieben: sie gelten jetzt fuer
den Sicherungs-Export nach public/data.json, den publish() ausloest.
"""

import json
import os
import sys
import urllib.error

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402


# ---------------------------------------------------------------------------
# Nachgebildete Gegenstelle
# ---------------------------------------------------------------------------


class _Antwort:
    """Minimale Nachbildung dessen, was urlopen als Kontextmanager liefert."""

    def __init__(self, rumpf: str):
        self._rumpf = rumpf.encode("utf-8")

    def read(self):
        return self._rumpf

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class Gegenstelle:
    """Sammelt die abgeschickten Anfragen und liefert vorgegebene Antworten."""

    def __init__(self):
        self.anfragen = []
        self.antworten = []
        self.fehler = None

    def antwortet(self, *nutzlasten):
        """Legt die Antworten fest, die der Reihe nach geliefert werden."""
        self.antworten = list(nutzlasten)
        return self

    def scheitert_mit(self, fehler):
        self.fehler = fehler
        return self

    def __call__(self, anfrage, timeout=None):
        self.anfragen.append(anfrage)
        if self.fehler is not None:
            raise self.fehler
        if self.antworten:
            nutzlast = self.antworten.pop(0)
        else:
            # Ohne vorgegebene Antwort verhaelt sich die Gegenstelle wie die
            # echte Datenbank mit "Prefer: return=representation": ein
            # Schreibvorgang gibt die gespeicherte Zeile zurueck, ein
            # Lesevorgang eine leere Liste. Eine leere Antwort auf einen
            # Schreibvorgang ist ein Sonderfall und muss im Test ausdruecklich
            # mit antwortet([]) verlangt werden - sonst wuerde der Normalfall
            # versehentlich den Fehlerpfad testen.
            nutzlast = [json.loads(anfrage.data.decode("utf-8"))] if anfrage.data else []
        if isinstance(nutzlast, str):
            return _Antwort(nutzlast)
        return _Antwort(json.dumps(nutzlast, ensure_ascii=False))

    # -- Auswertungshilfen ---------------------------------------------------

    @property
    def letzte(self):
        return self.anfragen[-1]

    def letzter_rumpf(self):
        return json.loads(self.letzte.data.decode("utf-8"))

    def kopf(self, name):
        # urllib normalisiert Kopfzeilennamen auf Capitalize-Form.
        return self.letzte.headers.get(name.capitalize())


GEHEIMNIS_FUER_TESTS = "test-geheimnis-nicht-echt-0123456789"


@pytest.fixture
def netz(monkeypatch):
    """Haengt die Gegenstelle ein und setzt ein Schreibgeheimnis."""
    g = Gegenstelle()
    monkeypatch.setattr(store.urllib.request, "urlopen", g)
    monkeypatch.setenv(store.GEHEIMNIS_ENV, GEHEIMNIS_FUER_TESTS)
    return g


@pytest.fixture
def netz_ohne_geheimnis(monkeypatch):
    g = Gegenstelle()
    monkeypatch.setattr(store.urllib.request, "urlopen", g)
    monkeypatch.delenv(store.GEHEIMNIS_ENV, raising=False)
    return g


# ---------------------------------------------------------------------------
# Schreibgeheimnis
#
# Neu noetig durch den Umbau: fehlt die Umgebungsvariable, muss das
# verstaendlich gemeldet werden statt spaeter als HTTP-403 aufzuschlagen.
# ---------------------------------------------------------------------------


def test_geheimnis_fehlt_meldet_klartext_und_schickt_nichts(netz_ohne_geheimnis):
    with pytest.raises(store.StoreError) as exc:
        store.add_entry("etappen", {"name": "Rom"})
    meldung = str(exc.value)
    assert store.GEHEIMNIS_ENV in meldung
    assert "Schreibgeheimnis fehlt" in meldung
    # Es darf gar nicht erst eine Anfrage rausgehen.
    assert netz_ohne_geheimnis.anfragen == []


def test_geheimnis_fehlt_meldung_ist_bei_allen_schreibwegen_dieselbe(
    netz_ohne_geheimnis,
):
    for aufruf in (
        lambda: store.add_entry("etappen", {"name": "Rom"}),
        lambda: store.update_entry("etappen", "x", {"notiz": "y"}),
        lambda: store.delete_entry("etappen", "x"),
    ):
        with pytest.raises(store.StoreError) as exc:
            aufruf()
        assert str(exc.value) == store.MELDUNG_GEHEIMNIS_FEHLT
    assert netz_ohne_geheimnis.anfragen == []


def test_lesen_geht_auch_ohne_geheimnis(netz_ohne_geheimnis):
    netz_ohne_geheimnis.antwortet([{"id": "1", "name": "Rom"}])
    assert store.liste_lesen("etappen") == [{"id": "1", "name": "Rom"}]


def test_hat_geheimnis_meldet_leeren_wert_als_fehlend(monkeypatch):
    monkeypatch.setenv(store.GEHEIMNIS_ENV, "   ")
    assert store.hat_geheimnis() is False
    monkeypatch.setenv(store.GEHEIMNIS_ENV, "x")
    assert store.hat_geheimnis() is True


def test_geheimnis_wird_nur_beim_schreiben_mitgeschickt(netz):
    netz.antwortet([], [{"id": "1", "name": "Rom"}])
    store.liste_lesen("etappen")
    assert netz.kopf(store.GEHEIMNIS_KOPFZEILE) is None

    store.add_entry("etappen", {"name": "Rom"})
    assert netz.kopf(store.GEHEIMNIS_KOPFZEILE) == GEHEIMNIS_FUER_TESTS


def test_geheimnis_steht_in_keiner_fehlermeldung(netz):
    netz.scheitert_mit(
        urllib.error.HTTPError(store.DB_URL, 403, "Forbidden", {}, None)
    )
    with pytest.raises(store.StoreError) as exc:
        store.add_entry("etappen", {"name": "Rom"})
    assert GEHEIMNIS_FUER_TESTS not in str(exc.value)
    assert str(exc.value) == store.MELDUNG_GEHEIMNIS_ABGELEHNT


def test_netzfehler_wird_zu_klartext_ohne_traceback(netz):
    netz.scheitert_mit(TimeoutError("timed out"))
    with pytest.raises(store.StoreError) as exc:
        store.liste_lesen("etappen")
    assert "Keine Verbindung zur Datenbank" in str(exc.value)
    assert exc.value.__cause__ is None  # kein durchgereichter Traceback


# ---------------------------------------------------------------------------
# Kennungen
#
# Ersetzt test_add_entry_generates_uuid_hex: das Format ist nicht mehr
# uuid4-hex, sondern das des Frontends (src/db.js, neueKennung).
# ---------------------------------------------------------------------------


def test_neue_kennung_hat_frontend_format():
    kennung = store.neue_kennung()
    zeit, _, zufall = kennung.partition("-")
    assert zeit.isdigit()
    assert len(zeit) == 13  # Millisekunden seit 1970, wie Date.now()
    assert len(zufall) == 6
    assert all(z in "0123456789abcdefghijklmnopqrstuvwxyz" for z in zufall)


def test_neue_kennungen_sind_eindeutig():
    kennungen = {store.neue_kennung() for _ in range(500)}
    assert len(kennungen) == 500


def test_neue_kennung_sortiert_chronologisch():
    # Der Zeitstempel steht vorn, damit order=id.asc chronologisch bleibt.
    frueh = "1000000000000-zzzzzz"
    spaet = "1000000000001-000000"
    assert frueh < spaet


def test_add_entry_vergibt_kennung_im_frontend_format(netz):
    store.add_entry("etappen", {"name": "Rom"})
    gesendet = netz.letzter_rumpf()
    zeit, _, zufall = gesendet["id"].partition("-")
    assert zeit.isdigit() and len(zufall) == 6


# ---------------------------------------------------------------------------
# add_entry
# ---------------------------------------------------------------------------


def test_add_entry_respects_given_id(netz):
    store.add_entry("etappen", {"name": "Rom"}, id="fixed123")
    assert netz.letzter_rumpf()["id"] == "fixed123"


def test_add_entry_fills_missing_fields_with_empty_string(netz):
    store.add_entry("restaurants", {"name": "Da Enzo"})
    gesendet = netz.letzter_rumpf()
    template = store.CATEGORY_TEMPLATES["restaurants"]
    for field in template:
        assert field in gesendet
    assert gesendet["ort"] == ""
    assert gesendet["kueche"] == ""
    assert gesendet["etappeId"] == ""
    # keine Fremdfelder ausser id + template
    assert set(gesendet.keys()) == {"id", *template.keys()}


def test_add_entry_ignores_unknown_fields(netz):
    store.add_entry("etappen", {"name": "Rom", "spam": "x"})
    assert "spam" not in netz.letzter_rumpf()


def test_add_entry_unknown_category_raises(netz):
    with pytest.raises(store.StoreError):
        store.add_entry("foo", {"name": "x"})
    assert netz.anfragen == []


def test_add_entry_valid_enum_ok(netz):
    store.add_entry("bookings", {"titel": "LH123", "typ": "Flug"})
    assert netz.letzter_rumpf()["typ"] == "Flug"


def test_add_entry_empty_enum_ok(netz):
    store.add_entry("bookings", {"titel": "X"})
    assert netz.letzter_rumpf()["typ"] == ""


def test_add_entry_invalid_enum_raises(netz):
    with pytest.raises(store.StoreError):
        store.add_entry("bookings", {"titel": "X", "typ": "Rakete"})
    with pytest.raises(store.StoreError):
        store.add_entry("sightseeing", {"titel": "X", "status": "foo"})
    with pytest.raises(store.StoreError):
        store.add_entry("events", {"titel": "X", "status": "besucht"})
    # Ungueltige Werte duerfen die Datenbank gar nicht erst erreichen.
    assert netz.anfragen == []


def test_events_and_sightseeing_have_distinct_status_enums(netz):
    store.add_entry("events", {"titel": "X", "status": "gebucht"})
    store.add_entry("sightseeing", {"titel": "Y", "status": "besucht"})
    with pytest.raises(store.StoreError):
        store.add_entry("events", {"titel": "Z", "status": "besucht"})


def test_add_entry_ohne_bestaetigung_meldet_fehler(netz):
    # Antwortet die Datenbank auf ein Anlegen mit einer leeren Liste, ist der
    # Eintrag nicht bestaetigt. Frueher kam hier der lokal gebaute Eintrag
    # zurueck und der Aufrufer meldete "eingetragen", obwohl nichts
    # gespeichert war. update_entry und delete_entry werfen in derselben
    # Lage einen Fehler - add_entry muss das auch tun.
    netz.antwortet([])
    with pytest.raises(store.StoreError) as exc:
        store.add_entry("etappen", {"name": "Rom"})
    assert "nicht bestaetigt" in str(exc.value)
    assert "NICHT gespeichert" in str(exc.value)
    assert "etappen" in str(exc.value)


def test_die_drei_schreibwege_melden_fehlende_bestaetigung_gleich(netz):
    # Der eigentliche Befund war die Uneinigkeit der drei Funktionen.
    # Dieser Test haelt sie zusammen.
    for aufruf in (
        lambda: store.add_entry("etappen", {"name": "Rom"}),
        lambda: store.update_entry("etappen", "1", {"notiz": "x"}),
        lambda: store.delete_entry("etappen", "1"),
    ):
        netz.antwortet([])
        with pytest.raises(store.StoreError):
            aufruf()


def test_add_entry_gibt_die_gespeicherte_zeile_zurueck(netz):
    netz.antwortet([{"id": "abc", "name": "Rom", "notiz": "aus der Datenbank"}])
    entry = store.add_entry("etappen", {"name": "Rom"})
    assert entry["notiz"] == "aus der Datenbank"


def test_add_entry_fordert_nur_die_bekannten_spalten_an(netz):
    store.add_entry("etappen", {"name": "Rom"})
    adresse = netz.letzte.full_url
    assert "select=" + ",".join(store.FELDER["etappen"]) in adresse
    assert "id_numerisch" not in adresse
    assert "aktualisiert_am" not in adresse


# ---------------------------------------------------------------------------
# update_entry
# ---------------------------------------------------------------------------


def test_update_entry_schickt_nur_die_genannten_felder(netz):
    netz.antwortet([{"id": "1", "name": "Rom", "notiz": "3 Tage"}])
    updated = store.update_entry("etappen", "1", {"notiz": "3 Tage"})
    assert netz.letzter_rumpf() == {"notiz": "3 Tage"}
    assert updated["notiz"] == "3 Tage"
    assert updated["name"] == "Rom"


def test_update_entry_aendert_die_kennung_nicht(netz):
    netz.antwortet([{"id": "1", "name": "Rom"}])
    store.update_entry("etappen", "1", {"id": "andere", "name": "Rom"})
    assert "id" not in netz.letzter_rumpf()


def test_update_entry_missing_id_raises(netz):
    netz.antwortet([])  # Datenbank meldet: keine Zeile getroffen
    with pytest.raises(store.StoreError) as exc:
        store.update_entry("etappen", "nope", {"notiz": "x"})
    assert "nope" in str(exc.value)


def test_update_entry_invalid_enum_raises(netz):
    with pytest.raises(store.StoreError):
        store.update_entry("bookings", "1", {"typ": "Rakete"})
    assert netz.anfragen == []


def test_update_entry_ignoriert_unbekannte_felder(netz):
    netz.antwortet([{"id": "1", "name": "Rom"}])
    store.update_entry("etappen", "1", {"notiz": "x", "spam": "y"})
    assert netz.letzter_rumpf() == {"notiz": "x"}


# ---------------------------------------------------------------------------
# delete_entry
# ---------------------------------------------------------------------------


def test_delete_entry(netz):
    netz.antwortet([{"id": "1", "von": "Rom", "nach": "Neapel"}])
    removed = store.delete_entry("route", "1")
    assert removed["id"] == "1"
    assert netz.letzte.get_method() == "DELETE"


def test_delete_entry_missing_raises(netz):
    netz.antwortet([])
    with pytest.raises(store.StoreError):
        store.delete_entry("route", "nope")


def test_delete_entry_trifft_genau_eine_kennung(netz):
    netz.antwortet([{"id": "a b/c"}])
    store.delete_entry("route", "a b/c")
    # Sonderzeichen in der Kennung duerfen die Adresse nicht aufbrechen.
    assert "id=eq.a%20b%2Fc" in netz.letzte.full_url


# ---------------------------------------------------------------------------
# load_data (Datenbank -> bekanntes Geruest)
# ---------------------------------------------------------------------------


def test_load_data_holt_alle_kategorien(netz):
    netz.antwortet(*([[{"id": "1"}]] * len(store.CATEGORIES)))
    data = store.load_data()
    assert set(data["data"].keys()) == set(store.CATEGORIES)
    assert len(netz.anfragen) == len(store.CATEGORIES)
    assert data["app"] == "urlaub-app"
    assert data["version"] == 1
    assert data["updatedAt"].endswith("Z")


def test_load_data_leere_datenbank_gibt_leere_listen(netz):
    netz.antwortet(*([[]] * len(store.CATEGORIES)))
    data = store.load_data()
    assert all(data["data"][c] == [] for c in store.CATEGORIES)


def test_unlesbare_antwort_meldet_klartext(netz):
    # Ersetzt test_load_broken_json_returns_empty: eine kaputte Datei gibt es
    # nicht mehr, eine kaputte Antwort schon. Anders als frueher wird sie NICHT
    # stillschweigend als "leer" ausgelegt - stilles Leer-Melden wuerde bei
    # einer Datenbank so aussehen, als waeren die Daten weg.
    netz.antwortet("{ kein gueltiges json ")
    with pytest.raises(store.StoreError) as exc:
        store.liste_lesen("etappen")
    assert "unlesbare Antwort" in str(exc.value)


def test_liste_lesen_unbekannte_kategorie_raises(netz):
    with pytest.raises(store.StoreError):
        store.liste_lesen("foo")
    assert netz.anfragen == []


def test_felder_decken_template_plus_id_ab():
    # Laufen Datenschicht und Frontend beim Feldschnitt auseinander, faellt es
    # hier auf - FELDER ist wortgleich zu FELDER in src/db.js.
    for cat in store.CATEGORIES:
        assert store.FELDER[cat] == ("id", *store.CATEGORY_TEMPLATES[cat].keys())


# ---------------------------------------------------------------------------
# Sicherungsdatei (public/data.json) - der Datei-Pfad von publish()
# ---------------------------------------------------------------------------


def test_ensure_shape_completes_partial():
    # Uebernommen aus test_load_partial_shape_is_completed: das Vervollstaendigen
    # des Umschlags gilt weiter, nur die Quelle ist nicht mehr die Datei.
    data = store._ensure_shape({"data": {"etappen": [{"id": "x", "name": "Rom"}]}})
    assert data["data"]["etappen"] == [{"id": "x", "name": "Rom"}]
    for c in store.CATEGORIES:
        if c != "etappen":
            assert data["data"][c] == []


def test_save_is_atomic_and_sets_updatedat(tmp_path):
    p = str(tmp_path / "data.json")
    saved = store.save_data(p, store.empty_data())
    assert saved["updatedAt"] is not None
    assert saved["updatedAt"].endswith("Z")
    # keine Temp-Reste
    leftovers = [f for f in os.listdir(tmp_path) if f.startswith(".data-")]
    assert leftovers == []
    on_disk = json.loads(open(p, encoding="utf-8").read())
    assert on_disk["updatedAt"] == saved["updatedAt"]


def test_save_pretty_and_unicode(tmp_path):
    p = str(tmp_path / "data.json")
    data = store.empty_data()
    data["data"]["etappen"] = [
        {"id": "1", "name": "München", "notiz": "Grüße, Straße – 20 °C"}
    ]
    store.save_data(p, data)
    raw = open(p, encoding="utf-8").read()
    assert "München" in raw  # ensure_ascii=False
    assert "Grüße" in raw
    assert "–" in raw and "°" in raw
    assert "\n  " in raw  # eingerueckt


def test_save_schreibt_gueltiges_json_mit_allen_sechs_listen(tmp_path):
    # Ersetzt test_save_roundtrip: zurueckgelesen wird nicht mehr aus der Datei,
    # aber die Datei muss weiterhin als Backup-Import taugen.
    p = str(tmp_path / "data.json")
    data = store.empty_data()
    data["data"]["etappen"] = [{"id": "1", "name": "Rom"}]
    store.save_data(p, data)
    wieder = json.loads(open(p, encoding="utf-8").read())
    assert wieder["app"] == "urlaub-app"
    assert wieder["version"] == 1
    assert set(wieder["data"].keys()) == set(store.CATEGORIES)
    assert wieder["data"]["etappen"][0]["name"] == "Rom"


def test_save_wiederholt_bei_gesperrter_datei(tmp_path, monkeypatch):
    # Gilt sinngemaess weiter: der Sicherungs-Export schreibt weiterhin auf P:,
    # wo pCloud die Zieldatei kurzzeitig sperren kann.
    p = str(tmp_path / "data.json")
    versuche = {"n": 0}
    echtes_replace = os.replace

    def zickig(quelle, ziel):
        versuche["n"] += 1
        if versuche["n"] == 1:
            raise PermissionError("[WinError 5] pCloud haelt die Datei")
        return echtes_replace(quelle, ziel)

    monkeypatch.setattr(store.os, "replace", zickig)
    monkeypatch.setattr(store, "REPLACE_RETRY_DELAY_S", 0)
    store.save_data(p, store.empty_data())
    assert versuche["n"] == 2
    assert json.loads(open(p, encoding="utf-8").read())["app"] == "urlaub-app"
    assert [f for f in os.listdir(tmp_path) if f.startswith(".data-")] == []


def test_export_datei_schreibt_den_datenbankstand(tmp_path, netz):
    netz.antwortet(*([[{"id": "1", "name": "München"}]] * len(store.CATEGORIES)))
    p = str(tmp_path / "data.json")
    store.export_datei(p)
    wieder = json.loads(open(p, encoding="utf-8").read())
    assert set(wieder["data"].keys()) == set(store.CATEGORIES)
    assert wieder["data"]["etappen"][0]["name"] == "München"


# ---------------------------------------------------------------------------
# find_etappe (unveraendert: arbeitet auf einem bereits geladenen Geruest)
# ---------------------------------------------------------------------------


def _mit_etappen(*namen):
    data = store.empty_data()
    data["data"]["etappen"] = [
        {"id": f"id{i}", "name": name} for i, name in enumerate(namen)
    ]
    return data


def test_find_etappe_none():
    assert store.find_etappe(store.empty_data(), "Rom") is None


def test_find_etappe_single_returns_id():
    data = _mit_etappen("Rom")
    assert store.find_etappe(data, "rom") == "id0"  # case-insensitiv
    assert store.find_etappe(data, "Ro") == "id0"  # substring


def test_find_etappe_multiple_returns_candidates():
    data = _mit_etappen("Rom Zentrum", "Rom Flughafen")
    result = store.find_etappe(data, "rom")
    assert isinstance(result, list)
    assert len(result) == 2
    assert {"name", "id"} <= set(result[0].keys())


def test_find_etappe_empty_text_none():
    assert store.find_etappe(_mit_etappen("Rom"), "  ") is None


# ---------------------------------------------------------------------------
# resolve_etappe_arg (unveraendert)
# ---------------------------------------------------------------------------


def test_resolve_empty_arg():
    etappe_id, hinweis = store.resolve_etappe_arg(store.empty_data(), "")
    assert etappe_id == ""
    assert hinweis == ""


def test_resolve_by_name_unique():
    etappe_id, hinweis = store.resolve_etappe_arg(_mit_etappen("Rom"), "rom")
    assert etappe_id == "id0"
    assert hinweis == ""


def test_resolve_by_id():
    etappe_id, hinweis = store.resolve_etappe_arg(_mit_etappen("Rom"), "id0")
    assert etappe_id == "id0"
    assert hinweis == ""


def test_resolve_unknown_returns_hint_with_existing():
    etappe_id, hinweis = store.resolve_etappe_arg(_mit_etappen("Rom"), "Paris")
    assert etappe_id == ""
    assert "Rom" in hinweis


def test_resolve_unknown_no_etappen():
    etappe_id, hinweis = store.resolve_etappe_arg(store.empty_data(), "Paris")
    assert etappe_id == ""
    assert "keine Etappen" in hinweis


def test_resolve_ambiguous_returns_hint():
    data = _mit_etappen("Rom Zentrum", "Rom Flughafen")
    etappe_id, hinweis = store.resolve_etappe_arg(data, "rom")
    assert etappe_id == ""
    assert "nicht eindeutig" in hinweis
