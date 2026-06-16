# Carmagne App - PRD

## Original Problem Statement
"Quiero que en esa app que está en github (https://github.com/RaichFx/carmagne-app), implementes el apartado de añadir tu parte semanal de trabajo mediante cámara o subida de archivo."

## App Purpose
Carmagne Instal SL internal app: worker check-in/clock-out, work logs by site, tools tracking, and weekly work reports.

## User Personas
- **Trabajador**: Logs in via Spanish phone number, submits clock-ins, weekly reports, and tools.
- **Administrador**: Logs in with username/password, manages workers/sites/tools, sees all logs, hours and weekly reports.
- **Super Admin**: Full permissions (delete weekly reports, etc.).

## Tech Stack
- Frontend: Vite + React 19 + TypeScript + TailwindCSS + Firebase Firestore (storage). Path: `/app/frontend`.
- Backend: FastAPI (Python) + emergentintegrations (GPT-4o via Emergent LLM Key). Path: `/app/backend`.
- Vite dev proxy routes `/api/*` to `http://localhost:8001`.

## Core Requirements (static)
- Worker check-in / check-out / break with geolocation
- Site management, tools/equipment tracking
- Weekly work report submission (camera or file upload) with AI extraction
- Admin dashboard with hours summary, logs, reports

## Implemented (with dates)
- **2026-01 - Weekly Report Feature**:
  - Backend endpoint `POST /api/weekly-report/extract` (GPT-4o vision)
  - Worker UI: `WeeklyReportModal` with phases CAPTURE / PREVIEW / EXTRACTING / FORM / SUCCESS (camera + file upload, AI prefill)
  - Admin UI: "Partes" tab in sidebar - current-week status grid per worker, filters, report cards, detail viewer, delete (super admin)
  - Storage: Firestore `weekly_reports` collection + localStorage fallback
  - Vite proxy `/api -> :8001`
  - Project restructured into `/app/frontend` and `/app/backend` to match platform supervisor
  - 100% test pass on backend + frontend

## Prioritized Backlog
- P1: Export weekly reports to PDF/Excel from admin panel
- P1: Send Telegram notification to admin when worker submits a weekly report
- P2: Allow workers to view their own previous weekly reports in a list (history)
- P2: Detection / warning if a worker hasn't submitted a report by Sunday evening (auto reminder)
- P3: Split App.tsx (~700 lines) into smaller components

## Next Tasks (if user requests follow-up)
- PDF export of weekly reports
- Telegram notification on report submission
- Worker-side weekly report history view
