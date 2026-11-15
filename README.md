# Learn CISSP — Human-Centered Exam & Diagnostic Learning Studio

A zero-backend, static-first **CISSP Exam Practice & Diagnostic Learning System** built with **Astro 5**, **React 19 Islands**, **Tailwind CSS v4**, and **Browser-Based Storage (`IndexedDB` + `localStorage`)**.

## Quick Start

```bash
# Install dependencies
npm install

# Start the development server (http://localhost:4321)
npm run dev

# Run strict Astro + Zod schema check and build static output
npm run build
```

## Key Features Built for Learning

- **Three-Level Exam & CBK Explorer (`Overall` · `Domains (8)` · `Sub-Domains`)**:
  - Browse overall readiness, inspect all 8 official ISC2 CISSP CBK domains, or filter by individual sub-domains (`1.1` through `8.5`) and launch focused sub-domain drills.
- **Domain 1 Mastery Exam (`d1-full-01`)**:
  - Covers all 12 sub-domains of **Domain 1: Security and Risk Management (`1.1`–`1.12`)** with self-indicating diagnostic metadata, distractor trap classifications, and "Think Like a Manager" takeaways.
- **Calm, Peripheral Visual Timing & Telemetry**:
  - Ambient top progress hairline, per-question benchmark pacing bar, session ring, and 1-click **Calm Timer Mode** (hides ticking seconds while preserving visual pacing bars) so metrics never compete with reading the question.
- **Ergonomic Question & Answer Canvas**:
  - High-contrast dark/light themes, adjustable reading typography (`Normal` / `Large`), optional CISSP keyword highlighting (`BEST`, `FIRST`, `MOST`), scannable scenario parameter chips, option strike-through (`✕` or right-click), and 1-click confidence capture (`Guess` / `Leaning` / `Certain`).
- **Interactive Domain 1 Concept & Formula Lab**:
  - Live **Quantitative Risk Simulator** (`AV`, `EF`, `SLE`, `ARO`, `ALE`, and `Safeguard Net Value`), **BIA Recovery Timeline** (`RPO ← Disaster → RTO + WRT ≤ MTD`), and side-by-side **Mindset Contrast Cards**.
- **5-Chart Post-Exam Diagnostic & Gap Summary**:
  1. **Sub-Domain Target Gap Bullet Chart** (Achieved % vs. 70% Pass & 85% Mastery targets)
  2. **Multi-Axis Sub-Domain Radar Chart**
  3. **Distractor Trap & Bloom's Cognitive Level Breakdown**
  4. **Metacognitive Quadrant (`Confidence × Accuracy`)**
  5. **Per-Question Pacing Timeline**
  - Plus a **Priority Gap Index (`PGI`) Strength/Weakness Table** and filterable Question Review Explorer.
- **100% Local Persistence + JSON Backup/Restore**:
  - Instant auto-save to IndexedDB (`cissp_learning_db`), sticky **Resume Exam Banner**, and full JSON export/restore at `/history`.

## Documentation for Agents & Developers

- **[AGENTS.md](./AGENTS.md)** — Quick-start rules and guardrails for AI agents working in this repository.
- **[docs/VISION_AND_AGENT_PLAYBOOK.md](./docs/VISION_AND_AGENT_PLAYBOOK.md)** — Full product vision, Astro technical architecture, IndexedDB browser persistence engine, diagnostic gap formulas, and graphical summary specifications.
- **[docs/QUESTION_DATA_SPEC.md](./docs/QUESTION_DATA_SPEC.md)** — Canonical 8-Domain CISSP taxonomy, self-indicating JSON question schema, distractor trap taxonomy, and per-option explanation standards.
