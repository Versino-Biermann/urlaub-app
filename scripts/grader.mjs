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

/**
 * Urteil ausgeben und das Skript beenden. Einziger Ausgang des Skripts, damit
 * jeder Pfad - auch die Startfehler - dieselbe Meldeform benutzt.
 */
function beende(code, text, vitestStatus) {
  try {
    rmSync(ERGEBNIS_DATEI, { force: true })
  } catch {
    // Aufraeumen ist Nebensache. Eine gesperrte Temp-Datei darf das Urteil
    // nicht kippen und schon gar nicht das Skript abstuerzen lassen.
  }

  const etikett = { 0: 'GRUEN', 1: 'ROT', 2: 'KEIN ERGEBNIS' }[code]
  // Auf stderr, damit die Zeile nicht mit der Reporter-Ausgabe auf stdout
  // vermischt wird.
  console.error(`\n[grader] ${etikett} (exit ${code}) - ${text} vitest-Exit war ${vitestStatus}.`)
  process.exit(code)
}

// default-Reporter fuer den Menschen, json-Reporter fuer die Maschine.
//
// Zwei getrennte Startfehler-Wege, beide abgesichert:
//   - spawnSync WIRFT bei fehlerhaften Aufrufargumenten (gemessen: RangeError
//     bei ungueltigem timeout, TypeError bei Nicht-Zeichenketten-Kommando).
//     Ohne try/catch stirbt das Skript hier mit einem Node-Stacktrace - also
//     ohne die Einordnung, fuer die es gebaut ist.
//   - spawnSync WIRFT NICHT, wenn nur das Kommando fehlt; es liefert dann
//     lauf.error (ENOENT) bzw. bei shell:true einen Shell-Exit. lauf.error
//     wurde vorher nie geprueft.
let lauf
try {
  lauf = spawnSync(
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
} catch (fehler) {
  beende(
    2,
    `Testlauf liess sich nicht starten (${fehler.constructor.name}: ${fehler.message.split('\n')[0]}) - kein Testergebnis.`,
    'nicht gestartet',
  )
}

if (lauf.error) {
  beende(
    2,
    `Testlauf liess sich nicht starten (${lauf.error.message.split('\n')[0]}) - kein Testergebnis.`,
    lauf.status,
  )
}

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
  // success === true impliziert bereits numFailedTests === 0 - die zweite
  // Bedingung war redundant. Die Zahl wird nur noch fuer den Meldetext gebraucht.
  if (bericht.success === true) {
    return { code: 0, text: `${gesamt} Tests gelaufen, alle gruen.` }
  }

  return {
    code: 1,
    text: `${gesamt} Tests gelaufen, ${fehlgeschlagen} rot - echte Regression.`,
  }
}

const urteil = bewerte()
beende(urteil.code, urteil.text, lauf.status)
