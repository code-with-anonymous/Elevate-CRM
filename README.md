# Elevate CRM

A multi-tenant SaaS CRM built with the MERN stack — manage leads, pipelines, contacts, tasks, and teams across isolated organizations, with role-based access control and a full authentication and security layer.

![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

---

## Overview

TTP CRM is not a single-vendor CRUD app — every record in the system is scoped to an organization (tenant), and every route enforces role-based access on top of that isolation. It was built to demonstrate real-world backend architecture: multi-tenancy, JWT auth with refresh token rotation, RBAC, two-factor authentication, and MongoDB aggregation pipelines for analytics — not just a UI on top of a database.

## Features

**Authentication & security**
- Registration, email verification, login/logout
- JWT access tokens + httpOnly refresh token rotation
- Forgot/reset password with automatic session revocation
- Two-factor authentication (TOTP) with backup codes
- Active session management and login history
- Rate limiting, input sanitization, Helmet, CORS

**Multi-tenancy & team management**
- Organization-scoped data — every query filtered by `organizationId`
- Role-based access control: Owner, Admin, Manager, Member, Viewer
- Team invitations with signed, expiring tokens
- Role assignment and member management

**Core CRM modules**
- **Dashboard** — pipeline value, weekly revenue, conversion rate, lead activity feed, revenue trend, leads-by-source breakdown
- **Leads** — full CRUD, search, filters, status tracking, activity history
- **Pipeline** — drag-and-drop kanban across lead stages with optimistic UI updates
- **Contacts** — auto-created from won leads
- **Tasks** — list and board views, priorities, due dates, time tracking
- **Calendar** — month view of tasks and deal deadlines
- **Reports** — sales performance by rep, pipeline forecast, lead source ROI
- **Settings** — profile, organization, team, security, notifications, billing

**UX**
- Light/dark mode
- Fully responsive
- Loading skeletons, empty states, and error states on every view

## Tech stack

**Frontend**
React 19 · Vite · Tailwind CSS v4 · shadcn/ui + Radix UI · React Router v7 · Zustand · TanStack Query · React Hook Form + Zod · Axios · Framer Motion · Recharts · @dnd-kit · Lucide Icons

**Backend**
Node.js · Express.js · MongoDB + Mongoose · JWT · bcryptjs · Nodemailer (SendGrid) · express-validator · Helmet · express-rate-limit · mongo-sanitize

## Architecture

The backend follows a layered structure — controllers stay thin and delegate all business logic to a service layer, which keeps aggregation pipelines and multi-step operations (like order/lead status transitions) out of the route handlers.

Every Mongoose model that holds tenant data carries an `organizationId` field, and every query is filtered by it via middleware that extracts the tenant from the verified JWT — no route is allowed to read or write across organizations.

```
Client (React)
     │
     ▼
API layer + JWT auth middleware
     │
     ├── RBAC middleware (role/permission check)
     │
     ▼
Controllers → Services → Mongoose models → MongoDB
```

## Project structure

```
client/
  src/
    components/     ui, layout, forms, tables, charts, common
    pages/           auth, dashboard, leads, pipeline, contacts,
                      tasks, calendar, reports, settings
    hooks/
    services/api/    axios instance + per-module service files
    store/           Zustand stores
    schemas/         Zod validation schemas
    types/

server/
  config/            db.js, env.js
  models/
  controllers/
  services/          all business logic, aggregation pipelines
  routes/
  middleware/         auth, rbac, rateLimiter, errorHandler
  validators/
  jobs/               scheduled tasks
  utils/
```

## Getting started

### Prerequisites

- Node.js v18 or later
- MongoDB (local instance or MongoDB Atlas)
- npm or yarn

### Installation

```bash
git clone https://github.com/code-with-anonymous/ttp-crm.git
cd ttp-crm

# install backend
cd server
npm install

# install frontend
cd ../client
npm install
```

### Running locally

```bash
# from /server
npm run dev

# from /client, in a separate terminal
npm run dev
```

The client runs on `http://localhost:5173` and the API on `http://localhost:5000` by default.

## Environment variables

**server/.env**
```
PORT=5000
NODE_ENV=development
MONGODB_URI=
CLIENT_URL=http://localhost:5173
ACCESS_TOKEN_SECRET=
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRES=7d
SENDGRID_API_KEY=
EMAIL_FROM=noreply@yourdomain.com
BCRYPT_ROUNDS=12
```

**client/.env**
```
VITE_API_BASE_URL=http://localhost:5000/api
```

## API overview

All routes are prefixed with `/api/v1` and require `Authorization: Bearer <token>` unless marked public. Major route groups:

| Module | Base path |
|---|---|
| Auth | `/auth` |
| Users & team | `/users`, `/workspace` |
| Leads | `/leads` |
| Pipeline / status | `/leads/:id/status` |
| Contacts | `/contacts` |
| Tasks | `/tasks` |
| Dashboard | `/dashboard` |
| Reports | `/reports` |
| Calendar | `/calendar` |

## Testing

```bash
# backend — Jest + Supertest
cd server
npm test -- --coverage

# frontend — Playwright end-to-end
cd client
npx playwright test
```

Multi-tenancy isolation and RBAC have dedicated test suites (`multitenancy.test.js`, `rbac.test.js`) since they're the highest-risk area for data leakage across organizations.

## Roadmap

- [ ] Real-time order/lead updates via Socket.io
- [ ] Global command-palette search across leads, contacts, tasks
- [ ] Organization-wide activity/audit log
- [ ] Mobile-optimized companion app

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to the branch and open a pull request

## License

MIT

## Author

**Muhammad Rayyan**
[GitHub](https://github.com/code-with-anonymous) · [LinkedIn](https://linkedin.com/in/muhammadrayyan05)
