// Grader-Einstieg fuer automatisierte Laeufe (Looper).
//
// Problem, das dieses Skript loest: Vitest liefert Exit-Code != 0 sowohl bei
// echten Testfehlern als auch bei einem Infrastrukturausfall, bei dem KEIN
// einziger Test gelaufen ist (auf diesem Netzlaufwerk beobachtet als
// "[vitest-pool-runner]: Timeout waiting for worker to respond", Ausgabe
// "Test Files  no tests"). Ein Automat, der nur den Exit-Code liest, haelt
// den zweiten Fall fuer eine Regression und fuengt an, funktionierenden Code
// zu "reparieren".
//
// Loesung: der JSON-Reporter liefert numTotalTests und success
// (Feldliste: https://vitest.dev/guide/reporters, Abschnitt JSON Reporter).
// Daraus werden drei unterscheidbare Exit-Codes:
//
//   0 = Tests sind gelaufen, alle gruen
//   1 = Tests sind gelaufen, mindestens einer ist rot  -> echte Regression
//   2 = KEIN Testergebnis                              -> Infrastrukturausfall
//
// BEWUSST KEIN RETRY. Ein automatischer zweiter Versuch wuerde echte,
// sporadische Fehler verschleiern und den Grader wertlos machen. Exit-Code 2
// heisst: nichts gemessen, also auch nichts bewertet - der Aufrufer
// entscheidet, ob er erneut startet.
//
// Zusaetzliche Argumente werden an vitest weitergegeben, z.B.
//   node scripts/grader.mjs src/App.merge.test.jsx

import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ERGEBNIS_DATEI = join(tmpdir(), `vitest-grader-${process.pid}.json`)
const WEITERE_ARGUMENTE = process.argv.slice(2)

// Aufraeumen, falls eine Datei aus einem abgebrochenen Lauf liegen geblieben ist.
if (existsSync(ERGEBNIS_DATEI)) rmSync(ERGEBNIS_DATEI, { force: true })

// default-Reporter fuer den Menschen, json-Reporter fuer die Maschine.
const lauf = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    '--reporter=default',
    '--reporter=json',
    `--outputFile=${ERGEBNIS_DATEI}`,
    ...WEITERE_ARGUMENTE,
  ],
  { stdio: 'inherit', shell: true },
)

function bewerte() {
  if (!existsSync(ERGEBNIS_DATEI)) {
    return {
      code: 2,
      text: 'Kein Ergebnisbericht geschrieben - der Testlauf ist vor dem ersten Test abgebrochen.',
    }
  }

  let bericht
  try {
    bericht = JSON.parse(readFileSync(ERGEBNIS_DATEI, 'utf8'))
  } catch {
    return {
      code: 2,
      text: 'Ergebnisbericht ist unlesbar - kein verwertbares Testergebnis.',
    }
  }

  const gesamt = Number(bericht.numTotalTests ?? 0)
  if (gesamt === 0) {
    return {
      code: 2,
      text: 'Null Tests ausgefuehrt - Infrastrukturausfall, kein Testergebnis.',
    }
  }

  const fehlgeschlagen = Number(bericht.numFailedTests ?? 0)
  if (bericht.success === true && fehlgeschlagen === 0) {
    return { code: 0, text: `${gesamt} Tests gelaufen, alle gruen.` }
  }

  return {
    code: 1,
    text: `${gesamt} Tests gelaufen, ${fehlgeschlagen} rot - echte Regression.`,
  }
}

const urteil = bewerte()
rmSync(ERGEBNIS_DATEI, { force: true })

const etikett = { 0: 'GRUEN', 1: 'ROT', 2: 'KEIN ERGEBNIS' }[urteil.code]
// Auf stderr, damit die Zeile nicht mit der Reporter-Ausgabe auf stdout vermischt wird.
console.error(
  `\n[grader] ${etikett} (exit ${urteil.code}) - ${urteil.text}` +
    ` vitest-Exit war ${lauf.status}.`,
)

process.exit(urteil.code)
