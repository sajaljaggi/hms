# Care & Cure HMS: BTP Report (Version 2)

The updated report. It keeps every heading of the first report and adds the work done in phase 2: seven new modules, security hardening, automated testing and deployment.

## Compile

**Overleaf (recommended):** upload `BTP_Report_v2_overleaf.zip`, set **Main.tex** as the main document, choose the **pdfLaTeX** or **XeLaTeX** compiler, and click Compile. The bibliography runs automatically.

**Locally:**
```bash
pdflatex Main && bibtex Main && pdflatex Main && pdflatex Main
```
or
```bash
tectonic -X compile Main.tex
```
(`Main.pdf` in this folder was built this way.)

## Check before submitting

| File | What to check |
|------|---------------|
| `AuxPages/title1.tex` | Title, names, roll numbers, month and year (currently November 2026) |
| `AuxPages/certificate.tex` | Academic session (currently 2026–2027) and adviser name |
| `Chapters/Chapter2.tex` | The Jaipur-hospital columns of the comparison table come from the first report and were not re-surveyed |

## Structure

| File | Chapter |
|------|---------|
| `Chapters/Chapter1.tex` | Introduction (plus a new section: Summary of Enhancements) |
| `Chapters/Chapter2.tex` | Literature Review (plus blood bank, beds, ESI triage, telemedicine, payments, wayfinding, security) |
| `Chapters/Chapter3.tex` | System Design and Architecture (all 21 tables, updated DFDs and ER, appointment life cycle, full API, RBAC matrix, concurrency design) |
| `Chapters/Chapter4.tex` | Implementation and Results (updated code, Zod, transactions, Redis, migrations, XSS fix, DB-stored files, 55 test cases) |
| `Chapters/Chapter5.tex` | **New:** Enhanced Hospital Modules |
| `Chapters/Chapter6.tex` | **New:** Testing and Quality Assurance |
| `Chapters/Chapter7.tex` | **New:** Deployment and Operations |
| `Chapters/conclusion.tex` | Conclusions, Future Work, and **new** Limitations |
| `Chapters/AppendixA.tex`, `AppendixB.tex` | **New:** Setup guide, User guide by role |
| `AuxPages/abbreviations.tex` | **New:** List of Abbreviations |
