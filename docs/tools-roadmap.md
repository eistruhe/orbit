# Tools-Roadmap

**Status: Alle 4 Wellen umgesetzt** (13 Tools, Stand 2026-08-18). Offen sind
nur noch die optionalen Ausbauten: Deps-Audit Phase C (Lockfile + Advisories),
verlustfreies EXIF-Stripping, SERP „Von URL laden".

Umsetzungsplan für 13 neue Tools, gruppiert in 4 Wellen mit steigender
Infrastruktur-Tiefe. Jede Welle ist unabhängig shipbar; innerhalb einer Welle
sind die Tools untereinander unabhängig und einzeln umsetzbar.

**Konventionen für jedes Tool** (gelten überall, werden pro Tool nicht wiederholt):

- Eintrag in `src/components/orbit/tools/tool-registry.ts` + Route in `src/router.tsx`
  (damit automatisch in Hub, Sidebar und Command Palette).
- Seite unter `src/components/orbit/tools/<id>-page.tsx`.
- Gemeinsame Bausteine verwenden: `ToolSection`, `SegmentedControl`, `DropZone`,
  `UrlForm`, `Textarea`, `Button`/`Input` (h-8-Kontrollhöhe überall).
- Copy-Buttons mit Check-Feedback (1,2 s), Downloads über `downloadBlob`.
- Clipboard-Paste (Cmd+V) überall dort, wo Text/Dateien Eingabe sind —
  Muster aus `csv-viewer-page.tsx` (Guard: nicht in Inputs/Textareas eingreifen).
- Server-Endpunkte: Modul unter `server/<name>.ts`, Route in `server/index.ts`
  registrieren, Client-Funktion in `src/lib/api.ts`.
- Verifikation: `bunx tsc --noEmit` + `bunx eslint <geänderte Dateien>`
  (globales `bun run lint` hat ~48 Alt-Fehler-Baseline) + Browser-Check.

Aufwand: S ≈ eine Seite ohne Überraschungen, M ≈ Seite + etwas Logik/Server,
L ≈ mehrere Teile / neues Infrastruktur-Stück.

---

## Welle 1 — Quick Wins (rein client-seitig, keine/kleine Dependencies)

### 1.1 String Utilities — `/tools/strings` (S)

- Eine Eingabe-Textarea, darunter live alle Umwandlungen als Copy-Zeilen:
  Slug (mit Umlaut-Transliteration ä→ae, ß→ss), camelCase, PascalCase,
  kebab-case, snake_case, CONSTANT_CASE, Title Case, lower/UPPER.
- Zähler-Leiste: Zeichen, Zeichen ohne Leerzeichen, Wörter, Zeilen, UTF-8-Bytes.
- Keine Dependencies.

### 1.2 Timestamp & Cron — `/tools/time` (M)

- Tab 1 (SegmentedControl) „Timestamp": Unix s/ms ↔ ISO 8601 ↔ lokale Zeit,
  bidirektional editierbar (jedes Feld ist Quelle), „Jetzt"-Button,
  Relativzeit („vor 3 Tagen"), kleine Zeitzonen-Liste (UTC, Berlin, New York,
  Los Angeles, Tokio) via `Intl.DateTimeFormat`.
- Tab 2 „Cron": 5-Feld-Ausdruck + Makros (`@daily` …), menschenlesbare
  Erklärung via `cronstrue` (kleine Dependency, deutsche Locale verfügbar),
  nächste 5 Ausführungen mit eigener Next-Run-Berechnung (Minuten-Iteration
  reicht; Obergrenze 4 Jahre, dann Fehler).
- Dependency: `cronstrue`.

### 1.3 SERP Snippet Preview — `/tools/serp` (S–M)

- Inputs: Title, Meta Description, URL; Live-Vorschau als Google-Snippet
  (Desktop + Mobile umschaltbar), inkl. Breadcrumb-Darstellung der URL.
- Pixel-Messung per Canvas `measureText` (Arial; Title ~20 px, Description
  ~14 px), Fortschrittsbalken gegen die Grenzwerte (Title ~580 px Desktop,
  Description ~990 px), Zeichen-Zähler sekundär.
- Optional (nice-to-have, Welle 3+): „Von URL laden" über den bestehenden
  SEO-Audit-Endpoint, um Title/Description einer Live-Seite vorzubefüllen.
- Keine Dependencies.

### 1.4 Encoder / Decoder — `/tools/encode` (M)

- Modi via SegmentedControl: Base64, URL, HTML-Entities, JWT.
- Base64: Text ↔ Base64 (+ URL-safe-Variante), Datei → Base64/Data-URI über
  `DropZone` (mit Größenwarnung > ~2 MB).
- URL: `encodeURIComponent`/`encodeURI` umschaltbar, decode mit
  Fehlerbehandlung; Query-String-Ansicht (Key-Value-Tabelle) als Bonus.
- HTML-Entities: encode (named + numeric) / decode.
- JWT: Header + Payload formatiert (JSON), `exp`/`iat`/`nbf` als lesbare
  Zeiten mit Ablauf-Hinweis; deutlicher Hinweis „Signatur wird NICHT geprüft".
- Keine Dependencies.

### 1.5 Regex Tester — `/tools/regex` (M)

- Pattern-Input + Flag-Checkboxen (g i m s u y), Testtext-`Textarea`.
- Match-Highlighting im Testtext (Text in Spans zerlegen, `bg-highlight/15`),
  Tabelle der Matches mit Index + benannten/nummerierten Gruppen.
- Replace-Modus: Ersetzungs-String mit `$1`/`$<name>`-Support, Ergebnis-Preview.
- Presets-Dropdown (E-Mail, URL, IPv4, ISO-Datum, Hex-Farbe, deutsche PLZ/Telefon).
- Fehlertoleranz: ungültiges Pattern → Fehlermeldung statt Crash; Ausführung
  mit try/catch, bei `g`-Endlosschleifen-Gefahr (leerer Match) `lastIndex++`.
- Keine Dependencies.

---

## Welle 2 — Daten & Medien (kleine Dependencies, Muster aus CSV/Bild-Tools)

### 2.1 JSON Viewer — `/tools/json` (L)

Das Gegenstück zum CSV Viewer, gleiche Eingabe-Muster (DropZone, Cmd+V, Datei).

- Format / Minify mit Einrückungs-Wahl (2/4/Tab), Sortierung der Keys optional.
- Tree-View: eigene rekursive Komponente, kollabierbar, Typ-Färbung,
  Array-Längen/Objekt-Key-Zahlen; ab ~5.000 Knoten nur Top-Level aufgeklappt.
- Klick auf Knoten kopiert den Pfad (`data.items[3].name`) — Dot-Notation.
- Suche über Keys und Werte mit Treffer-Navigation (vor/zurück).
- Export: formatiertes JSON kopieren/downloaden; „Als TypeScript-Interface"
  (eigene, einfache Typ-Inferenz: Primitives, Arrays, verschachtelte
  Interfaces, optionale Felder bei uneinheitlichen Objekten).
- Fehleranzeige mit Zeile/Spalte bei ungültigem JSON (Position aus
  `JSON.parse`-Message extrahieren, im Text markieren).
- Keine Dependencies (Tree + TS-Generierung selbst, bewusst simpel).

### 2.2 QR-Code-Generator — `/tools/qr` (S–M)

- Typen via SegmentedControl: URL/Text, WLAN (SSID, Verschlüsselung, Passwort),
  vCard (Name, Firma, Telefon, E-Mail, URL).
- Optionen: Größe, Rand, Fehlerkorrektur (L/M/Q/H), Vordergrund-/Hintergrundfarbe.
- Live-Vorschau; Export als SVG und PNG (Größen-Presets), Copy als PNG.
- Dependency: `qrcode` (liefert Canvas + SVG-String; klein, ohne DOM-Zwang).

### 2.3 EXIF Viewer & Stripper — `/tools/exif` (M)

- DropZone (JPEG/PNG/WebP/HEIC-soweit-lesbar, multiple), pro Bild:
  Metadaten-Tabelle (Kamera, Objektiv, Belichtung, Datum, Software),
  GPS-Koordinaten mit „In Karte öffnen"-Link (öffnet Maps-URL extern).
- „Metadaten entfernen": Re-Encode über Canvas (JPEG-Qualität wählbar,
  PNG/WebP verlustfrei möglich) → Download einzeln oder alle;
  Hinweis, dass Re-Encode auch das Farbprofil entfernt.
- Vorher/Nachher-Dateigröße wie beim Image-Convert-Tool.
- Dependency: `exifr` (nur lesen; stripping via Canvas, kein Writer nötig).

### 2.4 Redirect-Generator — `/tools/redirect-rules` (M)

Gegenstück zum bestehenden Redirect-Checker.

- Regel-Tabelle: Quelle → Ziel, Typ (301/302/307/308), Zeilen hinzufügen/
  entfernen/sortieren; Import aus eingefügter Liste („alt neu" pro Zeile,
  Tab/Komma-getrennt — Parser-Wiederverwendung von PapaParse liegt nahe).
- Ausgabe-Tabs: `.htaccess` (Redirect/RewriteRule), nginx (`return`/`rewrite`),
  `vercel.json`, Netlify/Cloudflare `_redirects` — jeweils Copy/Download.
- Validierung: doppelte Quellen, Redirect-Ketten innerhalb der eigenen Regeln
  (A→B, B→C), Loops — als Warnungen über der Ausgabe.
- Querverweis-Button „Im Redirect-Checker testen" (navigiert mit URL).
- Keine neuen Dependencies.

---

## Welle 3 — Netzwerk-Tools (Server-Endpunkte, Muster aus redirects/robots)

### 3.1 DNS Lookup — `/tools/dns` (M)

- Server `server/dns.ts`: Abfrage über DNS-over-HTTPS (Cloudflare
  `cloudflare-dns.com/dns-query` + Google als zweiter Resolver) — kein
  System-Resolver, dadurch deterministisch und mit TTLs.
  Typen: A, AAAA, CNAME, MX, TXT, NS, SOA, CAA; „ANY" = parallel alle.
- UI: Domain-Input (UrlForm-Variante ohne Protokoll), Record-Typ als
  SegmentedControl, Resolver-Umschalter; Ergebnis-Tabelle mit TTL und Copy.
- Vergleichsansicht der beiden Resolver bei abweichenden Antworten
  (Propagations-Check).

### 3.2 SSL-Check — `/tools/ssl` (M–L)

- Server `server/ssl.ts`: `tls.connect` (node:tls unter Bun) mit SNI,
  `getPeerCertificate(true)` → Subject, Issuer, SANs, gültig von/bis,
  Resttage, Chain (Aussteller-Kette), Protokoll-Version. Timeout 5 s.
- UI: Textarea für eine oder mehrere Domains (eine pro Zeile) → Tabelle mit
  Status-Farbe (ok / < 30 Tage gelb / abgelaufen oder Fehler rot),
  aufklappbare Detail-Zeile mit SANs und Chain.
- Eignet sich als wiederkehrender Kunden-Check: Domain-Liste wird in
  `localStorage` gemerkt (bewusst nicht in den Server-Prefs, bis Bedarf).

---

## Welle 4 — Projekt-integrierte Tools (nutzen Scanner + Dateizugriff)

### 4.1 Env-Vergleich — `/tools/env-compare` (M–L)

- Projekt-Auswahl aus dem bestehenden Scanner-Store (wie Cleanup-Tool);
  Server-Endpunkt listet `.env*`-Dateien im Projekt-Root und parst sie
  (dotenv-Format inkl. Kommentare/Quoting — eigener kleiner Parser).
- Vergleich zweier Dateien (Default: `.env` vs `.env.example`):
  fehlende Keys, überzählige Keys, leere Werte — Werte werden standardmäßig
  NICHT übertragen/angezeigt (nur Key-Namen); „Werte einblenden"-Toggle
  arbeitet dann rein lokal pro geöffneter Zeile.
- Aktion: fehlende Keys als Block für die Zieldatei kopieren (`KEY=`).
- Sicherheitsregel: Der Endpoint liefert Werte nur auf explizite Anfrage
  pro Datei, nie im Listen-Call.

### 4.2 Dependency-Audit — `/tools/deps` (L)

Das größte Stück, eigener Server-Teil `server/deps.ts`.

- Phase A (MVP): Ein Projekt auswählen → `package.json` lesen, für jede
  Dependency `https://registry.npmjs.org/<pkg>` (Dist-Tags + Versionsliste,
  `Accept: application/vnd.npm.install-v1+json` für schlanke Antwort) →
  Vergleich installierte Range vs. latest via `Bun.semver` (keine Dependency).
  Tabelle: Paket, Range, Latest, Diff-Typ (major/minor/patch, major rot),
  dep/devDep-Badge, Link zu npm. Parallel mit Limit (~8 gleichzeitig).
- Phase B: „Alle Projekte" — nutzt die Scanner-Liste, aggregiert pro Projekt
  (X outdated, davon Y major) mit Drill-down; Registry-Antworten in
  In-Memory-Cache mit TTL (1 h), damit der Sweep über viele Projekte nicht
  dieselben Pakete mehrfach abfragt.
- Phase C (optional, später entscheiden): installierte Ist-Versionen aus
  `bun.lock`/`package-lock.json` lesen statt nur Ranges; Security-Advisories
  (npm audit-Endpoint) — bewusst NICHT im ersten Wurf.
- UI-Filter: nur major, nur prod-Deps, Suche; Sortierung per Spaltenkopf
  (Muster aus CSV Viewer).

---

## Reihenfolge & Abhängigkeiten

```
Welle 1: strings → time → serp → encode → regex        (jedes einzeln shipbar)
Welle 2: json → qr → exif → redirect-rules
Welle 3: dns → ssl                                     (erst hier Server-Arbeit)
Welle 4: env-compare → deps (A → B → C)
```

- Innerhalb der Wellen gibt es keine harten Abhängigkeiten; die Reihenfolge
  ist Nutzen/Aufwand-sortiert.
- Neue Dependencies gesamt: `cronstrue`, `qrcode`, `exifr` — alle klein,
  alles andere bewusst hand-rolled bzw. über Bun-Bordmittel (`Bun.semver`, DoH).
- Nach jeder Welle: Registry/Router prüfen, tsc + eslint auf geänderten
  Dateien, Browser-Durchklick der neuen Seiten.

## Offene Entscheidungen (Defaults, falls nichts anderes gesagt wird)

1. **Tool-Anzahl im Hub**: Mit dann ~29 Tools wird das Grid lang — Default:
   so lassen (Command Palette + Sidebar tragen das), optional später
   Kategorie-Gruppierung im Hub.
2. **SSL/DNS Domain-Listen**: Default `localStorage`; alternativ in die
   Server-Prefs, wenn die Listen zwischen Web und Desktop synchron sein sollen.
3. **Deps-Audit Phase C** (Lockfile + Advisories): erst nach Praxistest von A/B.
4. **EXIF-Stripping**: Default Canvas-Re-Encode; verlustfreies JPEG-Stripping
   (piexif o. ä.) nur bei Bedarf nachrüsten.
