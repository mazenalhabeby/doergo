# Contributing to HBCField

## Development Setup

See [Setup Guide](../documentation/setup-guide.md) for full environment setup instructions.

### Quick Start
```bash
pnpm install
pnpm docker:dev
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev:api    # Terminal 1
pnpm dev:web    # Terminal 2
```

## Code Conventions

### General Principles

- Follow **SOLID** and **DRY** principles
- Check `@hbcfield/shared` before duplicating code
- Use TypeScript strict mode - add type annotations for all functions
- Keep solutions simple - avoid over-engineering

### File Naming

```
*.controller.ts  - HTTP handlers
*.service.ts     - Business logic
*.module.ts      - DI container
*.dto.ts         - Request/Response shapes
*.guard.ts       - Auth guards
*.decorator.ts   - Custom decorators
*.gateway.ts     - WebSocket handlers
```

### NestJS Services

```typescript
@Controller('resource')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  create(@Body() dto: CreateResourceDto, @CurrentUser() user: CurrentUserData) {
    return this.resourceService.create(dto, user);
  }
}
```

### API Response Format

```typescript
// Use shared helpers
import { success, error, paginated } from '@hbcfield/shared/api';

return success(data);                    // { data: T }
return success(data, 'Created');         // { data: T, message: 'Created' }
return paginated(items, total, page, limit);  // { data: T[], meta: {...} }
```

### Frontend (Web)

- Use **TanStack Query** for server state
- Use **Zod** for form validation
- Use **shadcn/ui** components from `src/components/ui/`
- Follow App Router conventions (Next.js 15)

### Frontend (Mobile)

- Use **Expo** managed workflow
- Store tokens in **expo-secure-store** (not AsyncStorage)
- Use shared types from `@hbcfield/shared`

## Git Workflow

### Branch Naming

```
feature/description    - New features
fix/description        - Bug fixes
refactor/description   - Code refactoring
docs/description       - Documentation updates
```

### Commit Messages

Write clear, concise commit messages:

```
feat: add technician scheduling endpoints
fix: resolve token refresh race condition
refactor: extract shared date utilities to @hbcfield/shared
docs: update API reference for invitation endpoints
```

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all services still start (`pnpm dev:api`)
4. Update documentation if adding/changing endpoints
5. Open a PR with:
   - Clear title (under 70 characters)
   - Summary of changes
   - Test plan

## Adding New Features

### New API Endpoint

1. Add DTO in `apps/api/gateway/src/modules/{module}/dto/`
2. Add MessagePattern handler in the relevant microservice
3. Add controller route in the gateway module
4. Add `@Roles()` decorator for authorization
5. Test via Swagger at `/docs`
6. Update `CLAUDE.md` section 6 (API Endpoints)

### New Database Model

1. Edit `apps/api/auth-service/prisma/schema.prisma`
2. Run `pnpm db:migrate` and name the migration
3. Run `pnpm db:generate`
4. Add shared types in `packages/shared/src/types/`
5. Update seed data if needed (`apps/api/auth-service/prisma/seed.ts`)

### New Web Page

1. Create `apps/web-app/src/app/(dashboard)/{route}/page.tsx`
2. Add to sidebar navigation in `app-sidebar.tsx`
3. Use existing UI components from `src/components/ui/`

### New Mobile Screen

1. Create screen in `apps/mobile/src/` or use Expo Router file conventions
2. Add to tab navigator if needed
3. Gate visibility on user role and workMode

## Shared Package

Before adding code to any app, check if it belongs in `@hbcfield/shared`:

| Add to shared if... | Don't add if... |
|---------------------|-----------------|
| Used by 2+ apps | App-specific logic |
| Type definitions | UI components (except shared ones) |
| Utility functions | Service implementations |
| Constants/enums | Database queries |
| Validators | Route handlers |

## Security Checklist

Before submitting a PR, verify:

- [ ] All new endpoints have `@Roles()` decorators
- [ ] User input is validated with class-validator DTOs
- [ ] Database queries are scoped to user's organization
- [ ] No secrets or credentials in code
- [ ] No raw SQL queries (use Prisma)
- [ ] Error responses don't leak internal details
