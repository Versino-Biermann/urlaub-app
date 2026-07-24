"""pytest gegen store.py (reine Datenlogik, keine MCP-SDK noetig).

Alle Tests arbeiten auf temporaeren data.json-Dateien (tmp_path), niemals
auf der echten public/data.json.
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402


# ---------------------------------------------------------------------------
# load_data / save_data
# ---------------------------------------------------------------------------


def test_load_missing_file_returns_empty(tmp_path):
    p = str(tmp_path / "nope.json")
    data = store.load_data(p)
    assert data["app"] == "urlaub-app"
    assert data["version"] == 1
    assert data["updatedAt"] is None
    assert set(data["data"].keys()) == set(store.CATEGORIES)
    assert all(data["data"][c] == [] for c in store.CATEGORIES)


def test_load_broken_json_returns_empty(tmp_path):
    p = tmp_path / "broken.json"
    p.write_text("{ not valid json ", encoding="utf-8")
    data = store.load_data(str(p))
    assert data == store.empty_data()


def test_load_partial_shape_is_completed(tmp_path):
    p = tmp_path / "partial.json"
    p.write_text(json.dumps({"data": {"etappen": [{"id": "x", "name": "Rom"}]}}),
                 encoding="utf-8")
    data = store.load_data(str(p))
    # fehlende Kategorien ergaenzt, vorhandene erhalten
    assert data["data"]["etappen"] == [{"id": "x", "name": "Rom"}]
    for c in store.CATEGORIES:
        if c != "etappen":
            assert data["data"][c] == []


def test_save_is_atomic_and_sets_updatedat(tmp_path):
    p = str(tmp_path / "data.json")
    data = store.empty_data()
    saved = store.save_data(p, data)
    assert saved["updatedAt"] is not None
    assert saved["updatedAt"].endswith("Z")
    # keine Temp-Reste
    leftovers = [f for f in os.listdir(tmp_path) if f.startswith(".data-")]
    assert leftovers == []
    # Datei ist gueltiges JSON mit gleichem Inhalt
    on_disk = json.loads(open(p, encoding="utf-8").read())
    assert on_disk["updatedAt"] == saved["updatedAt"]


def test_save_pretty_and_unicode(tmp_path):
    p = str(tmp_path / "data.json")
    data = store.empty_data()
    store.add_entry(data, "etappen", {"name": "München", "notiz": "Grüße"})
    store.save_data(p, data)
    raw = open(p, encoding="utf-8").read()
    assert "München" in raw  # ensure_ascii=False
    assert "\n  " in raw  # eingerueckt


def test_save_roundtrip(tmp_path):
    p = str(tmp_path / "data.json")
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom"})
    store.save_data(p, data)
    reloaded = store.load_data(p)
    assert reloaded["data"]["etappen"][0]["id"] == e["id"]
    assert reloaded["data"]["etappen"][0]["name"] == "Rom"


# ---------------------------------------------------------------------------
# add_entry
# ---------------------------------------------------------------------------


def test_add_entry_generates_uuid_hex(tmp_path):
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom"})
    assert isinstance(e["id"], str)
    assert len(e["id"]) == 32
    int(e["id"], 16)  # ist Hex


def test_add_entry_respects_given_id():
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom"}, id="fixed123")
    assert e["id"] == "fixed123"


def test_add_entry_fills_missing_fields_with_empty_string():
    data = store.empty_data()
    e = store.add_entry(data, "restaurants", {"name": "Da Enzo"})
    template = store.CATEGORY_TEMPLATES["restaurants"]
    for field in template:
        assert field in e
    assert e["ort"] == ""
    assert e["kueche"] == ""
    assert e["etappeId"] == ""
    # keine Fremdfelder ausser id + template
    assert set(e.keys()) == {"id", *template.keys()}


def test_add_entry_ignores_unknown_fields():
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom", "spam": "x"})
    assert "spam" not in e


def test_add_entry_unknown_category_raises():
    data = store.empty_data()
    with pytest.raises(store.StoreError):
        store.add_entry(data, "foo", {"name": "x"})


def test_add_entry_valid_enum_ok():
    data = store.empty_data()
    e = store.add_entry(data, "bookings", {"titel": "LH123", "typ": "Flug"})
    assert e["typ"] == "Flug"


def test_add_entry_empty_enum_ok():
    data = store.empty_data()
    e = store.add_entry(data, "bookings", {"titel": "X"})
    assert e["typ"] == ""


def test_add_entry_invalid_enum_raises():
    data = store.empty_data()
    with pytest.raises(store.StoreError):
        store.add_entry(data, "bookings", {"titel": "X", "typ": "Rakete"})
    with pytest.raises(store.StoreError):
        store.add_entry(data, "sightseeing", {"titel": "X", "status": "foo"})
    with pytest.raises(store.StoreError):
        store.add_entry(data, "events", {"titel": "X", "status": "besucht"})


def test_events_and_sightseeing_have_distinct_status_enums():
    data = store.empty_data()
    # events: geplant/gebucht
    store.add_entry(data, "events", {"titel": "X", "status": "gebucht"})
    # sightseeing: geplant/besucht
    store.add_entry(data, "sightseeing", {"titel": "Y", "status": "besucht"})
    # cross soll fehlschlagen
    with pytest.raises(store.StoreError):
        store.add_entry(data, "events", {"titel": "Z", "status": "besucht"})


# ---------------------------------------------------------------------------
# update_entry
# ---------------------------------------------------------------------------


def test_update_entry_merges():
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom"})
    updated = store.update_entry(data, "etappen", e["id"], {"notiz": "3 Tage"})
    assert updated["notiz"] == "3 Tage"
    assert updated["name"] == "Rom"  # unveraendert
    assert updated["id"] == e["id"]  # id bleibt


def test_update_entry_missing_id_raises():
    data = store.empty_data()
    with pytest.raises(store.StoreError):
        store.update_entry(data, "etappen", "nope", {"notiz": "x"})


def test_update_entry_invalid_enum_raises():
    data = store.empty_data()
    e = store.add_entry(data, "bookings", {"titel": "X", "typ": "Flug"})
    with pytest.raises(store.StoreError):
        store.update_entry(data, "bookings", e["id"], {"typ": "Rakete"})


# ---------------------------------------------------------------------------
# delete_entry
# ---------------------------------------------------------------------------


def test_delete_entry():
    data = store.empty_data()
    e = store.add_entry(data, "route", {"von": "Rom", "nach": "Neapel"})
    removed = store.delete_entry(data, "route", e["id"])
    assert removed["id"] == e["id"]
    assert data["data"]["route"] == []


def test_delete_entry_missing_raises():
    data = store.empty_data()
    with pytest.raises(store.StoreError):
        store.delete_entry(data, "route", "nope")


# ---------------------------------------------------------------------------
# find_etappe
# ---------------------------------------------------------------------------


def test_find_etappe_none():
    data = store.empty_data()
    assert store.find_etappe(data, "Rom") is None


def test_find_etappe_single_returns_id():
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom"})
    assert store.find_etappe(data, "rom") == e["id"]  # case-insensitiv
    assert store.find_etappe(data, "Ro") == e["id"]  # substring


def test_find_etappe_multiple_returns_candidates():
    data = store.empty_data()
    store.add_entry(data, "etappen", {"name": "Rom Zentrum"})
    store.add_entry(data, "etappen", {"name": "Rom Flughafen"})
    result = store.find_etappe(data, "rom")
    assert isinstance(result, list)
    assert len(result) == 2
    assert {"name", "id"} <= set(result[0].keys())


def test_find_etappe_empty_text_none():
    data = store.empty_data()
    store.add_entry(data, "etappen", {"name": "Rom"})
    assert store.find_etappe(data, "  ") is None


# ---------------------------------------------------------------------------
# resolve_etappe_arg
# ---------------------------------------------------------------------------


def test_resolve_empty_arg():
    data = store.empty_data()
    etappe_id, hinweis = store.resolve_etappe_arg(data, "")
    assert etappe_id == ""
    assert hinweis == ""


def test_resolve_by_name_unique():
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom"})
    etappe_id, hinweis = store.resolve_etappe_arg(data, "rom")
    assert etappe_id == e["id"]
    assert hinweis == ""


def test_resolve_by_id():
    data = store.empty_data()
    e = store.add_entry(data, "etappen", {"name": "Rom"})
    etappe_id, hinweis = store.resolve_etappe_arg(data, e["id"])
    assert etappe_id == e["id"]
    assert hinweis == ""


def test_resolve_unknown_returns_hint_with_existing():
    data = store.empty_data()
    store.add_entry(data, "etappen", {"name": "Rom"})
    etappe_id, hinweis = store.resolve_etappe_arg(data, "Paris")
    assert etappe_id == ""
    assert "Rom" in hinweis


def test_resolve_unknown_no_etappen():
    data = store.empty_data()
    etappe_id, hinweis = store.resolve_etappe_arg(data, "Paris")
    assert etappe_id == ""
    assert "keine Etappen" in hinweis


def test_resolve_ambiguous_returns_hint():
    data = store.empty_data()
    store.add_entry(data, "etappen", {"name": "Rom Zentrum"})
    store.add_entry(data, "etappen", {"name": "Rom Flughafen"})
    etappe_id, hinweis = store.resolve_etappe_arg(data, "rom")
    assert etappe_id == ""
    assert "nicht eindeutig" in hinweis
