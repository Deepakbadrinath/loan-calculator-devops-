# LoanPro DevOps: Git Branching Strategy & Collaboration Workflow

## 1. Executive Summary & Team Structure
This document defines the official source-control workflow and branching model for the **LoanPro** project. Designed specifically for a focused 3-developer engineering squad, this workflow balances velocity, code quality, and branch stability while minimizing merge conflicts.

### Team Roles & Responsibilities
| Developer | Primary Role | Domain Ownership | Typical Branch Prefixes |
| :--- | :--- | :--- | :--- |
| **Developer 1 (Deepak)** | Tech Lead / Core Engineer | Math engine (`loan-calculator.js`), architecture, CI/CD | `feature/calc-*`, `refactor/*`, `hotfix/*` |
| **Developer 2 (Alice)** | Frontend UI/UX Engineer | Views, DOM handling (`app.js`, `styles.css`, `index.html`) | `feature/ui-*`, `feature/view-*` |
| **Developer 3 (Bob)** | QA & DevOps Engineer | Business rules (`loan-service.js`), test suite (`tests.html`), storage | `test/*`, `feature/rules-*`, `bugfix/*` |

---

## 2. Branching Model: GitHub Flow (Trunk + Feature Branches)

We adopt **GitHub Flow** (Trunk-Based Development with short-lived feature branches). For a 3-developer team, heavy GitFlow introduces unnecessary overhead (e.g. keeping `develop` and `release` in sync). GitHub Flow keeps `main` as the single source of truth, protected and always deployable.

```
       (feature/prepayment-calculator)
            o---o (commits)
           /     \
main  o---o-------M (merge commit)---o---> [Deployable / Production]
           \     /
            o---o (concurrent feature or fix)
```

### Branch Hierarchy & Lifecycles
1. **`main` (Trunk)**:
   - **Purpose**: Stable, production-ready code.
   - **Protection Rules**: Direct pushes to `main` are restricted in production. All changes must arrive via reviewed Pull Requests (PRs).
   - **Deployment**: Any commit on `main` can be safely deployed to staging or production.
2. **`feature/<feature-name>`**:
   - **Purpose**: Development of a new feature or enhancement.
   - **Branch Off**: Always branch off the latest `main`.
   - **Lifecycle**: Short-lived (typically 1–3 days). Merged back into `main` and deleted immediately after merge.
   - **Naming Convention**: lowercase, hyphen-separated (e.g. `feature/prepayment-calculator`, `feature/foreclosure-quote`).
3. **`bugfix/<issue-name>`**:
   - **Purpose**: Fixing bugs identified during testing or development sprints.
   - **Branch Off**: Latest `main`.
   - **Lifecycle**: 1–2 days max.
4. **`hotfix/<incident-name>`**:
   - **Purpose**: Urgent fixes for high-severity production defects.
   - **Branch Off**: Directly off `main` at the current production tag.
   - **Lifecycle**: Immediate priority. Tested and merged back into `main`.

---

## 3. Commit Message Standards (Conventional Commits v1.0.0)

Every commit must tell a clear story of *what* changed and *why*. We follow the **Conventional Commits** specification:

### Format
```text
<type>(<scope>): <subject>

[optional body: explain why the change was made and any considerations]

[optional footer: closes #issue-number]
```

### Allowed Types
- `feat`: A new feature for the user or system (e.g. `feat(calculator): calculate EMI with prepayment`).
- `fix`: A bug fix (e.g. `fix(storage): prevent LocalStorage quota exceeded error`).
- `docs`: Documentation-only updates (e.g. `docs(readme): add local setup instructions`).
- `test`: Adding or correcting tests (e.g. `test(calculator): add leap year amortization test cases`).
- `refactor`: Code refactoring without changing functionality or fixing bugs.
- `style`: Formatting, whitespace, missing semicolons (no logic change).
- `chore`: Tooling, build config, package dependencies, repository maintenance.

### Commit Rules
1. **Imperative Mood**: Use "add feature", not "added feature" or "adds feature".
2. **Atomic Commits**: Each commit represents one logical change. Never bundle unrelated UI styling with calculation logic.
3. **Keep First Line Under 72 Characters**: Concise and actionable.

---

## 4. Pull Request & Code Review Protocol

To maintain high code quality across our 3 developers:
1. **Sync Before PR**: Rebase or merge `main` into your feature branch before opening or updating a PR to verify local compatibility:
   ```bash
   git checkout feature/your-feature
   git fetch origin
   git merge origin/main
   ```
2. **Automated Verification**: Run tests locally (`tests.html` or node test runner) to ensure 0 failures before pushing.
3. **Peer Review**: Every PR requires at least **one approving review** from a fellow team member.
   - Deepak reviews math & architecture changes.
   - Alice reviews UI/UX & CSS styling.
   - Bob reviews test coverage & edge cases.
4. **Merge Strategy**: Standard Merge Commit (`git merge --no-ff`) is preferred for major features to preserve feature history topology. Squash-and-merge may be used for single-commit trivial fixes.

---

## 5. Merge Conflict Resolution Protocol (SOP)

Merge conflicts occur naturally when multiple developers modify overlapping lines in the same file. They are an expected part of concurrent development. Follow this step-by-step Standard Operating Procedure (SOP) to resolve them cleanly:

### Step 1: Detect the Conflict
When merging `feature/prepayment-calculator` into `main`:
```bash
git checkout main
git merge feature/prepayment-calculator
# Output:
# CONFLICT (content): Merge conflict in js/loan-calculator.js
# Automatic merge failed; fix conflicts and then commit the result.
```

### Step 2: Identify Conflicted Files
Run `git status` to view unmerged paths:
```bash
git status
# Unmerged paths:
#   both modified:   js/loan-calculator.js
#   both modified:   tests.html
```

### Step 3: Understand Conflict Markers
Open the conflicted files in an editor. Git marks the conflicts using three delimiters:
```javascript
<<<<<<< HEAD
// Changes present on the target branch (e.g., main)
function calculateForeclosure(...) { ... }
=======
// Incoming changes from the source branch (e.g., feature/prepayment-calculator)
function calculatePrepaymentImpact(...) { ... }
>>>>>>> feature/prepayment-calculator
```
- `<<<<<<< HEAD`: Marks the beginning of the conflicting code from the current branch (`main`).
- `=======`: Separator dividing the two versions.
- `>>>>>>> <branch-name>`: Marks the end of the incoming conflicting code.

### Step 4: Resolve the Conflict Collaboratively
1. **Communicate**: If unclear, the resolving developer connects with the author of the conflicting commit.
2. **Combine Logically**: Keep valid logic from both branches (e.g., include both `calculateForeclosure` AND `calculatePrepaymentImpact`).
3. **Remove Markers**: Delete all `<<<<<<<`, `=======`, and `>>>>>>>` lines cleanly.

### Step 5: Validate and Test
Execute the test suite to ensure no syntax errors or regressions were introduced:
```bash
node -e "const C = require('./js/loan-calculator.js'); console.log('All functions loaded successfully');"
```

### Step 6: Stage and Commit the Resolution
```bash
git add js/loan-calculator.js tests.html
git commit -m "merge: resolve conflict merging feature/prepayment-calculator into main"
```

### Step 7: Review the Graph
Ensure a clean, readable history using:
```bash
git log --graph --oneline --all --decorate
```

---

## 6. Daily Developer Cheatsheet

```bash
# 1. Start a new day: pull latest main
git checkout main
git pull origin main

# 2. Create a new feature branch
git checkout -b feature/loan-statement-pdf

# 3. Work and commit with conventional messages
git add js/loan-service.js
git commit -m "feat(service): generate statement summary data structure"

# 4. Keep feature branch updated with main
git fetch origin
git merge origin/main

# 5. Push feature branch to GitHub
git push -u origin feature/loan-statement-pdf

# 6. View branch tree
git log --graph --oneline --all --decorate
```
