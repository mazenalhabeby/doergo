# Doergo

A modern field service management platform for task creation, assignment, and real-time execution tracking.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-red.svg)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![Expo](https://img.shields.io/badge/Expo-54-blue.svg)](https://expo.dev/)

## Overview

Doergo is a 3-role task management and field execution platform that enables:

- **Clients** to create and track service requests
- **Dispatchers** to assign technicians and monitor operations
- **Technicians** to execute tasks with real-time location tracking

```
Client creates task → Dispatcher assigns technician → Technician executes → Real-time updates
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
├───────────────────────────────────┬─────────────────────────────────┤
│              web-app              │         mobile                  │
│         (Next.js + RBAC)          │     (React Native/Expo)         │
│   :3000 (CLIENT & DISPATCHER)     │       (TECHNICIAN only)         │
└─────────────────┬─────────────────┴──────────────┬──────────────────┘
                  │                                │
                  └────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ API Gateway │ :4000/api/v1
                    │  (NestJS)   │ Swagger: /docs
                    │             │ Bull Board: /admin/queues
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         │ Redis Pub/Sub   │ BullMQ Queues   │
         │ (auth,tracking) │ (tasks)         │
         │                 │                 │
         ┌─────────────────┼─────────────────┬──────────────────┐
         ▼                 ▼                 ▼                  ▼
┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
│auth-service │   │task-service │   │notification- │   │tracking-     │
│             │   │ (BullMQ     │   │service       │   │service       │
│             │   │  Processor) │   │(Socket.IO)   │   │(GPS/Maps)    │
└─────────────┘   └─────────────┘   └──────────────┘   └──────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌──────────┐              ┌──────────┐
        │PostgreSQL│              │  Redis   │
        │(PostGIS) │              │ (Cache + │
        │  :5432   │              │  Queues) │
        └──────────┘              │  :6379   │
                                  └──────────┘
```

## Features

### Core Features
- **Multi-tenant SaaS** - Organizations with delegated access control
- **Role-based access** - CLIENT, DISPATCHER, TECHNICIAN roles with granular permissions
- **Real-time updates** - Socket.IO for live task and location updates
- **GPS tracking** - EN_ROUTE to ARRIVED route recording with distance calculation
- **Service reports** - Comprehensive job completion with photos, parts, and signatures
- **Asset management** - Track equipment and maintenance history

### Task Workflow
```
DRAFT → NEW → ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → CLOSED
                  │                     │           │              │
                  │                     │           │              ▼
                  │                     │           │          BLOCKED → IN_PROGRESS
                  ▼                     ▼           ▼              │
              CANCELED ◄───────────────────────────────────────────┘
```

### Security Features
- JWT authentication with refresh token rotation
- Rate limiting (3/sec, 20/10sec, 100/min)
- Account lockout after failed attempts
- Password hashing with bcrypt (cost factor 12)
- SHA-256 hashed tokens in database
- Input validation with class-validator
- Security headers with Helmet.js

## Tech Stack

| Layer | Technology |
|-------|------------|
| Web Frontend | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Mobile | React Native, Expo SDK 54, react-native-maps |
| Backend | NestJS 11, TypeScript, Microservices |
| Database | PostgreSQL with PostGIS, Prisma ORM |
| Cache/Queue | Redis, BullMQ |
| Real-time | Socket.IO |
| Auth | JWT (access + refresh tokens), RBAC |

## Project Structure

```
doergo/
├── apps/
│   ├── api/
│   │   ├── gateway/              # API Gateway - routes to microservices
│   │   ├── auth-service/         # Authentication & user management
│   │   │   └── prisma/           # Database schema & migrations
│   │   ├── task-service/         # Task CRUD, assets, reports
│   │   ├── notification-service/ # Socket.IO, email, push notifications
│   │   └── tracking-service/     # GPS location tracking
│   ├── web-app/                  # Next.js web portal (CLIENT & DISPATCHER)
│   └── mobile/                   # Expo mobile app (TECHNICIAN)
├── packages/
│   └── shared/                   # Shared types, utilities, modules
│       ├── types/                # TypeScript interfaces & enums
│       ├── prisma/               # Shared PrismaService
│       ├── microservices/        # Redis config, BaseGatewayService
│       ├── queues/               # BullMQ config, BaseQueueService
│       ├── api/                  # Response helpers, error codes
│       ├── constants/            # Auth & task constants
│       ├── validators/           # Validation decorators
│       ├── decorators/           # NestJS decorators (Roles, Public)
│       ├── guards/               # RolesGuard
│       ├── design/               # Design tokens, Tailwind preset
│       └── components/           # Shared React components
└── infra/
    └── docker/                   # Docker Compose files
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/doergo.git
   cd doergo
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start infrastructure services**
   ```bash
   pnpm docker:dev
   ```

4. **Set up environment files**
   ```bash
   # Copy example env files for each app
   cp apps/api/gateway/.env.example apps/api/gateway/.env
   cp apps/api/auth-service/.env.example apps/api/auth-service/.env
   cp apps/api/task-service/.env.example apps/api/task-service/.env
   cp apps/api/notification-service/.env.example apps/api/notification-service/.env
   cp apps/api/tracking-service/.env.example apps/api/tracking-service/.env
   cp apps/web-app/.env.example apps/web-app/.env.local
   cp apps/mobile/.env.example apps/mobile/.env
   ```

5. **Generate Prisma client and run migrations**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

6. **Seed the database**
   ```bash
   pnpm db:seed
   ```

7. **Start development servers**
   ```bash
   # Terminal 1: Start all API services
   pnpm dev:api

   # Terminal 2: Start web app
   pnpm dev:web

   # Terminal 3: Start mobile app
   pnpm dev:mobile
   ```

### Quick Start with Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Client | client@example.com | password123 |
| Dispatcher | dispatcher@example.com | password123 |
| Technician | technician1@example.com | password123 |

## Development

### Commands

```bash
# Development
pnpm dev:api          # Start all API services
pnpm dev:web          # Start web app (port 3000)
pnpm dev:mobile       # Start Expo mobile app

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed database
pnpm db:studio        # Open Prisma Studio

# Docker
pnpm docker:dev       # Start PostgreSQL + Redis

# Build
pnpm build            # Build all packages
```

### Important URLs

| URL | Description |
|-----|-------------|
| http://localhost:4000/api/v1 | API Gateway |
| http://localhost:4000/docs | Swagger Documentation |
| http://localhost:4000/admin/queues | Bull Board (Job Monitoring) |
| http://localhost:4001 | Notification Service (Socket.IO) |
| http://localhost:4001/socket/stats | Socket.IO Statistics |
| http://localhost:3000 | Web App |
| http://localhost:5556 | Prisma Studio |

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/register` | Register new account |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout and invalidate tokens |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |
| GET | `/auth/me` | Get current user |

### Tasks

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/tasks` | List tasks | ALL |
| POST | `/tasks` | Create task | CLIENT |
| GET | `/tasks/:id` | Get task detail | ALL |
| PATCH | `/tasks/:id` | Update task | CLIENT |
| DELETE | `/tasks/:id` | Delete task | CLIENT |
| POST | `/tasks/:id/assign` | Assign technician | DISPATCHER |
| POST | `/tasks/:id/start` | Start task | TECHNICIAN |
| POST | `/tasks/:id/complete` | Complete with report | TECHNICIAN |

### Tracking

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/tracking/location` | Update location | TECHNICIAN |
| GET | `/tracking/workers` | Get all technician locations | DISPATCHER |
| GET | `/tracking/tasks/:taskId/route` | Get task route | DISPATCHER |

Full API documentation available at `/docs` when running the gateway.

## Environment Variables

### Gateway (`apps/api/gateway/.env`)
```env
PORT=4000
JWT_SECRET=your-256-bit-secret
REDIS_HOST=localhost
REDIS_PORT=6379
CORS_ORIGINS=http://localhost:3000
```

### Auth Service (`apps/api/auth-service/.env`)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/doergo
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Web App (`apps/web-app/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_APP_NAME=Doergo
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Mobile (`apps/mobile/.env`)
```env
EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
```

## Shared Package

The `@doergo/shared` package provides reusable utilities:

```typescript
// Types and enums
import { Role, TaskStatus, TaskPriority } from '@doergo/shared';

// Microservice communication
import { BaseGatewayService, SERVICE_NAMES } from '@doergo/shared';

// BullMQ queue processing
import { BaseQueueService, QUEUE_NAMES, TASK_JOB_TYPES } from '@doergo/shared';

// API response helpers
import { success, error, paginated } from '@doergo/shared/api';

// Decorators
import { Roles, Public, CurrentUser } from '@doergo/shared';

// Guards
import { RolesGuard } from '@doergo/shared';

// Shared components
import { AnimatedLogo } from '@doergo/shared/components';
```

## Roles & Permissions

| Role | Platform | Create Tasks | Assign | Execute | Track |
|------|----------|--------------|--------|---------|-------|
| CLIENT | Web | Own org only | No | No | No |
| DISPATCHER | Web | No | Yes | No | Yes |
| TECHNICIAN | Mobile | No | No | Yes | Is tracked |

### Multi-Tenant Access

Organizations can delegate access to other organizations:
- `NONE` - No access
- `TASKS_ONLY` - View tasks only
- `TASKS_ASSIGN` - View and assign tasks
- `FULL` - Full access including workers and tracking

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow SOLID and DRY principles
- Use shared utilities from `@doergo/shared` to avoid duplication
- Add TypeScript types for all functions and components
- Use class-validator for backend DTOs
- Use Zod for frontend form validation

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Docker not running | `docker info` to check, start Docker Desktop |
| DB connection failed | Check `DATABASE_URL`, ensure Docker containers running |
| Prisma client outdated | Run `pnpm db:generate` |
| Port already in use | `lsof -ti:PORT \| xargs kill -9` |
| Redis connection refused | Check Redis container with `docker ps` |
| CORS errors | Check `CORS_ORIGINS` in gateway `.env` |

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Next.js](https://nextjs.org/) - React framework for production
- [Expo](https://expo.dev/) - React Native development platform
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [BullMQ](https://docs.bullmq.io/) - Job queue for Node.js
- [Socket.IO](https://socket.io/) - Real-time communication
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
