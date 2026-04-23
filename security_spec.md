# Security Specification - CARMAGNE INSTAL SL

## 1. Data Invariants
- A `Worker` must be active to be able to submit logs.
- `WorkLog` entries must include a valid `workerId` and `siteId`.
- Workers can only register their own logs.
- `AdminUser` management is restricted to existing admins.
- `AppConfig` is global and restricted.

## 2. The Dirty Dozen Payloads (Targeting Firestore)

### 1. Identity Spoofing (Logs)
```json
{
  "id": "malicious-log-1",
  "workerId": "other-worker-uid",
  "workerName": "Admin Spoof",
  "type": "ENTRADA",
  "timestamp": 1713904800000
}
```
*Expected: PERMISSION_DENIED (Worker cannot submit logs for someone else)*

### 2. State Shortcutting (Salida without Entry)
Note: This is mostly logical, but rules should ensure immutability of core fields.

### 3. Ghost Field Injection (Worker Registration)
```json
{
  "id": "W12345",
  "name": "Hacker",
  "active": true,
  "role": "SUPER_ADMIN",
  "phone": "+34600112233"
}
```
*Expected: PERMISSION_DENIED (Strict schema validation prevents shadow roles)*

### 4. Admin Password Hijacking
```json
{
  "adminPassword": "pwned"
}
```
*Expected: PERMISSION_DENIED (Only admins can write to config)*

### 5. Collection Scraping (Logs)
`GET /logs`
*Expected: PERMISSION_DENIED (Users should only be able to list their own logs)*

### 6. Resource Exhaustion (Long Site Names)
```json
{
  "name": "A".repeat(2000),
  "active": true
}
```
*Expected: PERMISSION_DENIED (Size limits on strings)*

### 7. Unauthorized Site Creation
```json
{
  "id": "S666",
  "name": "Secret Base"
}
```
*Expected: PERMISSION_DENIED (Only admins create sites)*

### 8. Historical Tampering (Updating old logs)
```json
{
  "workReport": "Changed after the fact"
}
```
*Expected: PERMISSION_DENIED (Logs are mostly immutable)*

### 9. ID Poisoning (Malicious Path)
`POST /workers/%2E%2E%2Fadmins%2Froot`
*Expected: PERMISSION_DENIED (isValidId checks)*

### 10. Self-Activation (Deactivated worker reactivation)
```json
{
  "active": true
}
```
*Expected: PERMISSION_DENIED (Only admins can change active status of workers)*

### 11. Tool Record Stealing
```json
{
  "id": "T-W-999",
  "workerId": "victim-uid",
  "toolName": "Stolen Drill"
}
```
*Expected: PERMISSION_DENIED (Identity integrity check)*

### 12. PII Leak (Reading Worker Details)
`GET /workers/some-uid`
*Expected: PERMISSION_DENIED (Unless it's the owner or admin)*

## 3. Test Runner (Draft)
I will implement these checks in the `firestore.rules` file directly as part of the validation logic.
