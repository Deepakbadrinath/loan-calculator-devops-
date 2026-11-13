# LoanPro – Loan & EMI Management (HTML + CSS + vanilla JS)

Browser-only learning/demo app. Data lives in LocalStorage (key `loanpro_data_v1`) — not secure, not shared across devices, not for real customer data.

## Run it (Antigravity or any editor)
1. In Antigravity: **File → Open Folder…** and choose this `loanpro` folder.
2. Open `index.html` in a browser, or serve it: `python -m http.server 8000` → http://localhost:8000
   (VS Code-style "Live Server" extensions also work). No install, no build step.
3. Open `tests.html` to run the EMI/schedule checks (TC-01…TC-04).

## Structure
- `index.html`, `css/styles.css` (includes print styles)
- `js/loan-calculator.js` – pure EMI + amortization (paise, month-end date clamping, integrity assertion)
- `js/loan-service.js` – business rules BR-01…BR-15, derived statuses, report queries, sample data
- `js/storage.js` – LocalStorage adapter, schema validation, atomic writes, JSON backup/restore
- `js/formatters.js` – INR, dates, CSV (formula-injection safe)
- `js/app.js` – routing and all views (dashboard, customers, loans, calculator, reports, settings, receipt)

## Demo flow
Customers → Loans (new application) → open loan → Approve → Record payment → Dashboard/Reports → Print receipt.
Sample data is labelled "Sample:" and loaded on first launch only; Settings → Reset reloads it.

## Ideas to extend in Antigravity
Sortable table headers, multi-installment payments, prepayment/late-fee rules (see PRD Appendix B), chart widgets in SVG, unit tests for `loan-service.js`.

## Engineering & Source Control
- **Git Branching Strategy**: See [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md) for the 3-developer team workflow (GitHub Flow, naming conventions, Conventional Commits, PR reviews, and merge conflict resolution SOP).

