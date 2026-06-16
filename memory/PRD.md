# Carmagne App - PRD

## Original Problem Statement
"Quiero que en esa app que está en github (https://github.com/RaichFx/carmagne-app), implementes el apartado de añadir tu parte semanal de trabajo mediante cámara o subida de archivo."

Iteración 2 (follow-up): Historial de partes del trabajador, recordatorio automático fin de semana, notificación Telegram al admin, exportar PDF/Excel.

## App Purpose
Carmagne Instal SL internal app: worker check-in/clock-out, work logs by site, tools tracking, and weekly work reports.

## User Personas
- **Trabajador**: Spanish phone login; clock-in/out, weekly reports + own history.
- **Administrador**: Username/password; full management + reports export.
- **Super Admin**: Can delete weekly reports.

## Tech Stack
- Frontend: Vite + React 19 + TypeScript + Tailwind + Firebase Firestore (`/app/frontend`).
- Backend: FastAPI + emergentintegrations (GPT-4o vía Emergent LLM Key) en `/app/backend`.
- Vite proxy `/api/*` → `http://localhost:8001`.

## Core Requirements (static)
- Worker check-in / out / break with geolocation
- Sites, tools/equipment tracking
- Weekly work report submission (camera or file) + AI extraction
- Admin dashboard with hours summary, logs, reports + exports

## Implemented (with dates)

### 2026-01 — Iteración 1: Weekly Report Core
- Backend `POST /api/weekly-report/extract` (GPT-4o vision)
- Worker UI: `WeeklyReportModal` (CAPTURE / PREVIEW / EXTRACTING / FORM / SUCCESS) con cámara y file upload
- Admin UI: tab "Partes" con estado actual de la semana por trabajador, filtros, cards, vista detalle, delete (super admin)
- Storage: Firestore `weekly_reports` + localStorage fallback
- Restructured `/app/frontend` + `/app/backend` to match supervisor

### 2026-01 — Iteración 2: Mejoras del flujo
- **Historial del trabajador**: Step.WORKER_WEEKLY_HISTORY con banner de estado semanal + lista de partes (foto, semana, obra, tareas, horas). Botón "Mis Partes" en el dashboard.
- **Recordatorio automático**: Banner ámbar en el dashboard del trabajador los viernes/sábados/domingos si no se ha enviado el parte de la semana.
- **Notificación Telegram al admin**: Mensaje HTML formateado (📋 nombre, semana, horas, obra, tareas, notas) enviado al canal cuando un trabajador envía un parte (silent no-op si los tokens son placeholders).
- **Exportaciones**: Botones PDF (resumen tabular de partes filtrados) y Excel/CSV (UTF-8 con BOM) en la cabecera del admin. Botón "Descargar PDF" por parte individual con imagen incrustada (en la tarjeta y en el modal de detalle).

100% test pass en ambas iteraciones.

## Prioritized Backlog
- P2: Configurar VITE_TELEGRAM_BOT_TOKEN / VITE_TELEGRAM_CHAT_ID reales (cliente) para activar las notificaciones
- P2: Recordatorio push/SMS para trabajadores que no envíen parte el domingo por la noche
- P2: Visualizar foto del parte directamente en la lista del trabajador (preview ampliable)
- P3: Split AdminPanel.tsx en `WeeklyReportsAdminTab.tsx` (file >1200 líneas)
- P3: Reemplazar nativo `confirm()` por modal estilizado para el registro

## Next Tasks (si el usuario pide follow-up)
- Configurar tokens reales de Telegram y test end-to-end del envío
- Vista de comparativa mensual (resumen total horas + nº partes por trabajador)
- Export CSV global del histórico de partes
