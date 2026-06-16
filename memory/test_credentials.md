# Test Credentials - Carmagne App

## Admin
- **Username**: `admin`
- **Password**: `admin`
- (Configured in /app/frontend/services/storageService.ts → INITIAL_CONFIG.adminPassword)

## Worker (test)
- **Phone**: `+34 600999888`
- **Name**: Test Usuario
- **DNI**: 12345678Z
- (Auto-registered during initial testing)

## Backend
- Internal URL: `http://localhost:8001`
- Health check: `GET /api/health`
- AI extraction: `POST /api/weekly-report/extract` with `{image_base64, mime_type}`

## Environment
- Emergent LLM Key configured in `/app/backend/.env` (EMERGENT_LLM_KEY)
- Model used: `gpt-4o` (OpenAI via Emergent universal key)
