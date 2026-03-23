# Doergo

**Role-based task management & field execution platform**

Doergo is a full-stack SaaS platform for managing field service operations. Admins create tasks, dispatchers assign technicians, and technicians execute work in the field with real-time GPS tracking.

```
Admin creates task  ->  Dispatcher assigns technician  ->  Technician executes  ->  Real-time updates
```

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** & Docker Compose

### Setup

```bash
# 1. Clone and install
git clone <REPO_URL> && cd doergo
pnpm install

# 2. Start infrastructure (PostgreSQL + Redis)
pnpm docker:dev

# 3. Set up database
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 4. Start development servers
pnpm dev:api     # API services on :4000
pnpm dev:web     # Web app on :3000
pnpm dev:mobile  # Expo mobile app
```

### Development URLs

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:4000/api/v1 |
| Swagger Docs | http://localhost:4000/docs |
| Bull Board (Jobs) | http://localhost:4000/admin/queues |
| Web App | http://localhost:3000 |
| Prisma Studio | http://localhost:5556 (`pnpm db:studio`) |
| Socket.IO Stats | http://localhost:4001/socket/stats |

### Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | client@example.com | password123 |
| Dispatcher | dispatcher@example.com | password123 |
| Technician 1 | technician1@example.com | password123 |
| Technician 2 | technician2@example.com | password123 |
| Orphan (onboarding) | newuser@example.com | password123 |

**Onboarding test**: Org join code `ACME2026`

## Architecture

```
+-----------------------+----------------------+
|    Web App (Next.js)  |   Mobile (Expo)      |
|    :3000              |   React Native       |
+-----------+-----------+-----------+----------+
            |                       |
            +-----------+-----------+
                        |
                 +------v------+
                 | API Gateway | :4000
                 +------+------+
                        |  Redis Transport + BullMQ
        +---------------+---------------+--------------+
        v               v               v              v
   auth-service    task-service    notification    tracking
                                   -service       -service
        |               |
        v               v
    PostgreSQL        Redis
    (PostGIS)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Web Frontend | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Mobile | React Native, Expo SDK 54, react-native-maps |
| Backend | NestJS (microservices), TypeScript |
| Database | PostgreSQL + PostGIS, Prisma ORM |
| Cache/Queue | Redis, BullMQ |
| Realtime | Socket.IO |
| Auth | JWT (access + refresh), RBAC with granular permissions |
| Push | Expo Push Notifications / FCM |

## Project Structure

```
doergo/
+-- apps/
|   +-- api/
|   |   +-- gateway/              # API Gateway (:4000)
|   |   +-- auth-service/         # Auth, users, onboarding, invitations
|   |   +-- task-service/         # Tasks, reports, locations, schedules
|   |   +-- notification-service/ # Socket.IO, push notifications
|   |   +-- tracking-service/     # GPS location tracking
|   +-- web-app/                  # Next.js portal (Admin & Dispatcher)
|   +-- mobile/                   # Expo app (Technician + onboarding)
+-- packages/
|   +-- shared/                   # Shared types, utils, components
+-- infra/
|   +-- docker/                   # Docker Compose files
+-- documentation/                # Full project documentation
+-- .github/                      # GitHub templates & contributing guide
```

## Roles & Permissions

| Role | Platform | Create Tasks | View All | Assign | Manage Users |
|------|----------|--------------|----------|--------|--------------|
| **ADMIN** | Web + Mobile | Yes | Yes | Yes | Yes |
| **DISPATCHER** | Web only | No | Yes | Yes | No |
| **TECHNICIAN** | Mobile only | No | Own only | No | No |

Each user has individual permission flags (`canCreateTasks`, `canViewAllTasks`, `canAssignTasks`, `canManageUsers`) that can override role defaults.

## Documentation

Full documentation is in [`documentation/`](./documentation/):

- [Architecture Overview](./documentation/architecture.md)
- [Setup Guide](./documentation/setup-guide.md)
- [API Reference](./documentation/api-reference.md)
- [Database Schema](./documentation/database-schema.md)
- [Roles & Permissions](./documentation/roles-permissions.md)
- [WebSockets](./documentation/websockets.md)
- [Security](./documentation/security.md)
- [Design System](./documentation/design-system.md)
- [Deployment](./documentation/deployment.md)
- [Troubleshooting](./documentation/troubleshooting.md)
- [Changelog](./documentation/changelog.md)

## Scripts

```bash
# Development
pnpm dev:api          # All API services (gateway + microservices)
pnpm dev:web          # Web app (:3000)
pnpm dev:mobile       # Expo mobile app

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed test data
pnpm db:studio        # Prisma Studio GUI

# Infrastructure
pnpm docker:dev       # Start PostgreSQL + Redis
pnpm docker:dev:down  # Stop containers

# Build & Quality
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm test             # Run all tests
```

## Contributing

See [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for development guidelines and conventions.

## License

Proprietary - All rights reserved.
