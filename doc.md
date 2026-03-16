# FeetF1rst CRM System - Technical Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema Overview](#database-schema-overview)
5. [API Architecture](#api-architecture)
6. [Authentication & Authorization](#authentication--authorization)
7. [Module Details](#module-details)
8. [Core Business Workflows](#core-business-workflows)
9. [Real-time Features](#real-time-features)
10. [Scheduled Jobs (Cron)](#scheduled-jobs-cron)
11. [File Storage & Media](#file-storage--media)
12. [Email Services](#email-services)
13. [Deployment Configuration](#deployment-configuration)
14. [Development Workflow](#development-workflow)

---

## 1. Project Overview

**FeetF1rst** is a comprehensive CRM (Customer Relationship Management) system designed specifically for orthopedic shoe businesses (Maßschuhe) and custom insole (Einlagen) providers in German-speaking regions.

### Key Features

- **Multi-tenant Architecture**: Supports multiple partners (businesses) with isolated data
- **Order Management**: Complete workflow for custom shoes, insoles, and other services
- **Customer Management**: Comprehensive customer database with medical history
- **Inventory Management**: Track stock levels, auto-ordering, supplier management
- **Real-time Messaging**: Internal chat between partners and employees
- **Appointment Scheduling**: Calendar system for customer appointments
- **Financial Tracking**: Insurance claims, private payments, invoicing
- **Document Management**: File uploads, PDFs, medical scans

---

## 2. Technology Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TECHNOLOGY STACK                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   Frontend  │    │   Backend   │    │   Database  │             │
│  │  (React/    │◄──►│  (Express   │◄──►│ (PostgreSQL │             │
│  │   Next.js)  │    │   + TypeScript)    │   + Prisma) │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│                           │                      │                   │
│                           ▼                      ▼                   │
│                    ┌─────────────┐    ┌─────────────┐               │
│                    │   Redis     │    │     S3      │               │
│                    │  (Session/   │    │  (File      │               │
│                    │   Cache)    │    │  Storage)   │               │
│                    └─────────────┘    └─────────────┘               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    ADDITIONAL TOOLS                         │   │
│  │  • Socket.IO (Real-time)  • Node-cron (Scheduled Jobs)     │   │
│  │  • Nodemailer (Email)     • Multer (File Upload)           │   │
│  │  • JWT (Authentication)   • AWS SDK (S3)                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Dependencies

| Category     | Technology         | Version    |
| ------------ | ------------------ | ---------- |
| Runtime      | Node.js            | Latest LTS |
| Language     | TypeScript         | ^5.8.2     |
| Framework    | Express            | ^5.1.0     |
| ORM          | Prisma             | ^6.19.2    |
| Database     | PostgreSQL         | 13+        |
| Cache        | Redis (ioredis)    | ^5.9.2     |
| Real-time    | Socket.IO          | ^4.8.1     |
| File Storage | AWS S3 SDK         | ^3.964.0   |
| Email        | Nodemailer         | ^7.0.3     |
| Auth         | JWT (jsonwebtoken) | ^9.0.2     |

---

## 3. Project Structure

```
feetf1rst-crm-system/
├── app.ts                          # Express app configuration
├── index.ts                        # Server entry point
├── db.ts                           # Prisma database connection
├── prisma.config.ts               # Prisma configuration
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
│
├── assets/                         # Static assets
│   ├── v1/                        # Version 1 assets
│   │   ├── data.ts                # Static data
│   │   └── kein_titel/            # Image files
│   └── v2/                        # Version 2 assets
│       └── exercise/               # Exercise images
│
├── config/                        # Configuration files
│   ├── multer.config.ts           # File upload config
│   └── redis.config.ts            # Redis connection
│
├── constants/                     # Application constants
│   ├── email_message.ts           # Email templates
│   ├── logo.ts                    # Logo assets
│   ├── order_email.ts             # Order email templates
│   └── leistenerstellung_access_email.ts
│
├── cron/                         # Scheduled jobs
│   ├── database_backup.ts         # Daily DB backup
│   └── weekly_report.ts           # Auto-order & reminders
│
├── middleware/                   # Express middleware
│   └── verifyUsers.ts             # JWT authentication
│
├── module/                       # Main application modules
│   ├── v1/                       # API version 1
│   │   ├── index.ts              # Router aggregator
│   │   ├── auth/                 # User authentication
│   │   ├── customers/            # Customer management
│   │   ├── customerOrders/       # Insole orders
│   │   ├── massschuhe_order/     # Custom shoe orders
│   │   ├── products/             # Product catalog
│   │   ├── storage/              # Inventory management
│   │   ├── messages/             # Internal messaging
│   │   ├── appointment/         # Scheduling
│   │   ├── employees/           # Staff management
│   │   ├── versorgungen/        # Supply/insurance
│   │   └── ...                  # Other modules
│   └── v2/                       # API version 2
│
├── prisma/                       # Database schema
│   └── schema.prisma             # Full database schema
│
├── public/                       # Public static files
│
└── utils/                        # Utility functions
    ├── s3utils.ts                # AWS S3 operations
    ├── emailService.utils.ts     # Email sending
    ├── base_utl.ts               # Base utilities
    ├── notification.utils.ts     # Notifications
    └── location.ts               # Location search
```

---

## 4. Database Schema Overview

The database uses PostgreSQL with Prisma ORM. Here's the high-level entity relationship diagram:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE ENTITY RELATIONSHIP                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│    ┌─────────┐         ┌─────────────┐         ┌─────────────┐                  │
│    │   User  │────────►│  Employees  │◄────────│  Customers  │                  │
│    │ (Partner│         │             │         │             │                  │
│    │  Admin) │         └──────┬──────┘         └──────┬──────┘                  │
│    └────┬────┘                │                      │                          │
│         │                     │                      │                          │
│         │                     │                      ▼                          │
│         │                     │              ┌───────────────┐                   │
│         │                     │              │ Screener Files│                   │
│         │                     │              │ (3D models,   │                   │
│         │                     │              │  scans, CSV)  │                   │
│         │                     │              └───────────────┘                   │
│         │                     │                      │                          │
│         ▼                     ▼                      ▼                          │
│    ┌─────────────────────────────────────────────────────────────────┐          │
│    │                        ORDERS                                    │          │
│    ├─────────────────┬──────────────────┬──────────────────────────┤          │
│    │ customerOrders  │ massschuhe_order │      shoe_order          │          │
│    │ (Insole)       │ (Custom Shoes)  │ (Shoe Production)        │          │
│    └────────┬────────┴────────┬─────────┴────────────┬─────────────┘          │
│              │               │                      │                          │
│              ▼               ▼                      ▼                          │
│    ┌─────────────────┐ ┌─────────────┐     ┌─────────────────┐                │
│    │ Versorgungen   │ │Custom Shafts│     │  shoe_order     │                │
│    │ (Supply/       │ │(Admin Shoe  │     │    _step        │                │
│    │  Insurance)    │ │ Collection) │     │ (Production)   │                │
│    └────────┬────────┘ └─────────────┘     └─────────────────┘                │
│              │                                                            │
│              ▼                                                            │
│    ┌─────────────────────────────────────────┐                            │
│    │              STORES                      │                            │
│    │  (Inventory Management)                 │                            │
│    ├─────────────────┬───────────────────────┤                            │
│    │ admin_store    │     Stores             │                            │
│    │ (Admin Stock)  │  (Partner Inventory)  │                            │
│    └─────────────────┴───────────────────────┘                            │
│                                                                          │
│    ┌──────────────────────────────────────────────────────────────┐      │
│    │                    OTHER ENTITIES                            │      │
│    │  • Products      • Messages      • Appointments              │      │
│    │  • Notifications • Conversations • Prescriptions           │      │
│    │  • Work Hours    • Timeline Analytics                        │      │
│    └──────────────────────────────────────────────────────────────┘      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Core Database Models

| Model                | Description            | Key Fields                       |
| -------------------- | ---------------------- | -------------------------------- |
| **User**             | Partners/Admins        | id, email, role, partnerId       |
| **Employees**        | Staff members          | partnerId, role, email           |
| **Customers**        | End customers          | partnerId, customerNumber, email |
| **customerOrders**   | Insole orders          | status, orderNumber, totalPrice  |
| **massschuhe_order** | Custom shoe orders     | status, orderNumber              |
| **shoe_order**       | Shoe production        | status, priority                 |
| **Stores**           | Inventory              | groessenMengen (JSON)            |
| **Versorgungen**     | Supply/Insurance       | name, rohlingHersteller          |
| **appointment**      | Scheduled appointments | date, time, customerId           |
| **Message**          | Internal messages      | senderId, recipientId            |
| **notification**     | System notifications   | type, message, isRead            |

---

## 5. API Architecture

### Base URLs

- **v1**: `http://localhost:3001/` (root)
- **v2**: `http://localhost:3001/v2`

### Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      API REQUEST FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Client                                                        │
│    │                                                           │
│    ▼ (HTTP Request with JWT)                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    EXPRESS SERVER                          │  │
│  │  ┌────────────┐    ┌──────────────┐    ┌──────────────┐  │  │
│  │  │  CORS      │───►│   Middleware │───►│  Controller  │  │  │
│  │  │  (Origins) │    │  (Auth, etc) │    │  (Business)  │  │  │
│  │  └────────────┘    └──────────────┘    └──────────────┘  │  │
│  │                                                │            │  │
│  │                                                ▼            │  │
│  │                                         ┌──────────────┐   │  │
│  │                                         │   Service    │   │  │
│  │                                         │   Layer      │   │  │
│  │                                         └──────┬───────┘   │  │
│  │                                                │            │  │
│  │                                                ▼            │  │
│  │                                         ┌──────────────┐   │  │
│  │                                         │   Database   │   │  │
│  │                                         │  (Prisma)    │   │  │
│  │                                         └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼ (Response)                          │
│  Client                                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Modules (v1)

| Module            | Route                       | Description                          |
| ----------------- | --------------------------- | ------------------------------------ |
| Auth              | `/users`                    | Login, register, password management |
| Account           | `/users/account`            | User account settings                |
| Partners          | `/partner`                  | Partner management                   |
| Customers         | `/customers`                | Customer database                    |
| Customer Orders   | `/customer-orders`          | Insole orders                        |
| Massschuhe Orders | `/massschuhe-order`         | Custom shoe orders                   |
| Shoe Orders       | `/customer-orders`          | Shoe production                      |
| Products          | `/products`                 | Product catalog                      |
| Storage           | `/store`                    | Inventory management                 |
| Messages          | `/message`                  | Internal messaging                   |
| Appointments      | `/appointment`              | Scheduling                           |
| Employees         | `/employees`                | Staff management                     |
| Exercises         | `/exercises`                | Exercise programs                    |
| Versorgungen      | `/versorgungen`             | Supply management                    |
| Statistics        | `/custom_shafts/statistics` | Analytics                            |

---

## 6. Authentication & Authorization

### JWT-Based Authentication

```
┌─────────────────────────────────────────────────────────────┐
│              AUTHENTICATION FLOW                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. LOGIN                                                    │
│  ┌─────────┐    POST /users/login    ┌──────────────────┐  │
│  │ Client  │ ──────────────────────► │  Validate creds  │  │
│  │         │ ◄────────────────────── │  Generate JWT    │  │
│  └─────────┘    { token, user }      └──────────────────┘  │
│                                                              │
│  2. SUBSEQUENT REQUESTS                                      │
│  ┌─────────┐    GET /customers       ┌──────────────────┐  │
│  │ Client  │ ──────────────────────► │  Verify JWT      │  │
│  │         │                         │  Extract user    │  │
│  │         │ ◄────────────────────── │  Check role      │  │
│  │         │    { data }             │  Process request │  │
│  └─────────┘                         └──────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Roles

| Role         | Description          | Access Level              |
| ------------ | -------------------- | ------------------------- |
| **ADMIN**    | System administrator | Full access               |
| **PARTNER**  | Business partner     | Own data + employees      |
| **EMPLOYEE** | Staff member         | Limited by feature access |
| **USER**     | Generic user         | Basic access              |

### Middleware Usage

```typescript
// Public endpoint (no auth required)
router.post('/users/login', usersController.login)

// Protected endpoint (any authenticated user)
router.get('/customers', verifyUser('ANY'), customersController.getAll)

// Admin only
router.post('/users/create-partnership', verifyUser('ADMIN'), ...)

// Partner or Admin
router.patch('/users/update-partner-profile', verifyUser('ADMIN', 'PARTNER'), ...)
```

---

## 7. Module Details

### 7.1 User & Authentication Module (`/users`)

**Features:**

- User registration and login
- JWT token generation
- Password change/reset with OTP
- Partner profile management
- Check authentication status

**Key Endpoints:**

- `POST /users/login` - Login
- `POST /users/register` - Register new user
- `PUT /users/` - Update profile
- `PATCH /users/change-password` - Change password
- `POST /users/create-partnership` - Create partner (Admin)
- `GET /users/partners` - List partners (Admin)

### 7.2 Customer Management Module (`/customers`)

**Features:**

- Customer CRUD operations
- Screener file uploads (3D models, foot scans)
- Medical history tracking
- Foot measurement data
- Customer requirements configuration

**Data Model:**

```
Customer
├── Basic Info (name, email, phone, address)
├── Medical Data (diagnosis, prescriptions)
├── Foot Measurements (fusslange, fussbreite, etc.)
├── Screener Files (3D models, images, CSV)
├── Orders (insole, shoe, massschuhe)
└── History (notes, events, timeline)
```

### 7.3 Order Management Modules

#### Insole Orders (`/customer-orders`)

```
Order Flow:
┌─────────────────────────────────────────────────────────────────┐
│ Warten_auf_Versorgungsstart → In_Fertigung → Verpacken_       │
│ → Abholbereit_Versandt → Ausgeführt                            │
└─────────────────────────────────────────────────────────────────┘
```

#### Custom Shoes (`/massschuhe-order`)

```
Production Flow:
┌─────────────────────────────────────────────────────────────────┐
│ Leistenerstellung → Bettungsherstellung → Halbprobenerstellung │
│ → Schafterstellung → Bodenerstellung → Geliefert               │
└─────────────────────────────────────────────────────────────────┘
```

#### Shoe Production (`/shoe-order`)

```
10-Step Process:
┌─────────────────────────────────────────────────────────────────┐
│ Auftragserstellung → Leistenerstellung → Bettungserstellung   │
│ → Halbprobenerstellung → Halbprobe_durchführen → Schaft_      │
│ fertigen → Bodenerstellen → Qualitätskontrolle → Abholbereit  │
│ → Ausgeführt                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 Inventory Management (`/store`)

**Features:**

- Admin store (central inventory)
- Partner stores (partner-specific inventory)
- Auto-ordering system
- Stock tracking and history
- Size-based quantity management

**Data Structure:**

```json
{
	"35": { "length": 87, "quantity": 27, "mindestmenge": 70 },
	"36": { "length": 92, "quantity": 15, "mindestmenge": 70 }
}
```

### 7.5 Messaging & Chat

**Features:**

- Internal messaging system
- Partner conversations (team chat)
- Real-time messaging with Socket.IO
- Message favorites and archiving

### 7.6 Appointments (`/appointment`)

**Features:**

- Schedule customer appointments
- Employee assignment
- Reminder notifications (cron job)
- Calendar integration

---

## 8. Core Business Workflows

### 8.1 Customer Order Workflow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     INSOLE ORDER WORKFLOW                                   │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CUSTOMER CREATION                                                       │
│     ┌─────────┐    ┌──────────────┐    ┌─────────────┐                       │
│     │ Partner │───►│ Create       │───►│ Save        │                       │
│     │         │    │ Customer     │    │ Customer    │                       │
│     └─────────┘    └──────────────┘    └─────────────┘                       │
│                                              │                              │
│                                              ▼                              │
│  2. SCREENER (FOOT ANALYSIS)                                              │
│     ┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────┐   │
│     │ Upload  │───►│ 3D Models    │───►│ Foot        │───►│ Save      │   │
│     │ Scans  │    │ (left/right) │    │ Measurements│    │ Screener  │   │
│     └─────────┘    └──────────────┘    └─────────────┘    └───────────┘   │
│                                              │                              │
│                                              ▼                              │
│  3. ORDER CREATION                                                         │
│     ┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────┐   │
│     │ Select  │───►│ Configure    │───►│ Calculate   │───►│ Create    │   │
│     │ Versorgung│   │ Options     │    │ Price       │    │ Order     │   │
│     └─────────┘    └──────────────┘    └─────────────┘    └───────────┘   │
│                                              │                              │
│                                              ▼                              │
│  4. PRODUCTION & FULFILLMENT                                              │
│     ┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────┐   │
│     │ In      │───►│ Quality      │───►│ Packaged &  │───►│ Delivered │   │
│     │ Fertigung│   │ Check        │    │ Ready       │    │ /Picked Up│   │
│     └─────────┘    └──────────────┘    └─────────────┘    └───────────┘   │
│                                              │                              │
│                                              ▼                              │
│  5. PAYMENT                                                                │
│     ┌─────────┐    ┌──────────────┐    ┌─────────────┐                      │
│     │ Insurance│   │ Private Pay  │───►│ Payment     │                      │
│     │ Claim   │    │              │    │ Recorded    │                      │
│     └─────────┘    └──────────────┘    └─────────────┘                      │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Partner Onboarding Workflow

```
┌────────────────────────────────────────────────────────────────┐
│                PARTNER ONBOARDING WORKFLOW                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ADMIN CREATES PARTNER                                       │
│     POST /users/create-partnership                              │
│     ├── Email invitation sent                                   │
│     ├── Temporary password generated                            │
│     └── Partner profile created                                 │
│                         │                                        │
│                         ▼                                        │
│  2. PARTNER SETS UP                                             │
│     ├── Login with temp password                                │
│     ├── Set new password                                        │
│     ├── Configure business details                              │
│     ├── Add employees                                           │
│     └── Set up store locations                                  │
│                         │                                        │
│                         ▼                                        │
│  3. START OPERATIONS                                            │
│     ├── Add customers                                           │
│     ├── Configure products/pricing                              │
│     ├── Set up insurance providers                              │
│     └── Begin taking orders                                     │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 8.3 Custom Shoe Production Workflow

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CUSTOM SHOE (MASSCHUHE) WORKFLOW                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  STAGE 1: ORDER CREATION                                               │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ Customer  │─►│ Medical     │─►│ Select      │─►│ Create       │  │
│  │ Selection │  │ Prescription│  │ Shoe Model  │  │ Order        │  │
│  └────────────┘  └─────────────┘  └─────────────┘  └──────────────┘  │
│                                                                        │
│  STAGE 2: PRODUCTION (Categories)                                     │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                                                                 │  │
│  │  ┌──────────────────┐   ┌──────────────────┐                  │  │
│  │  │ Halbproben-      │   │ Massschafter-    │  ┌─────────────┐ │  │
│  │  │ erstellung       │   │ stellung         │  │Bodenkon-   │ │  │
│  │  │ (Half Model)     │   │ (Shaft Creation) │  │struktion   │ │  │
│  │  └────────┬─────────┘   └────────┬─────────┘  │(Sole Build) │ │  │
│  │           │                      │            └──────┬──────┘ │  │
│  │           └──────────────────────┴───────────────────┘       │  │
│  │                              │                                  │  │
│  │                              ▼                                  │  │
│  │                    ┌─────────────────┐                        │  │
│  │                    │ Complete Shoe   │                        │  │
│  │                    │ Ready for       │                        │  │
│  │                    │ Delivery        │                        │  │
│  │                    └─────────────────┘                        │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  STAGE 3: DELIVERY                                                     │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │ Quality    │─►│ Package     │─►│ Ship to     │                     │
│  │ Check      │  │             │  │ Customer    │                     │
│  └────────────┘  └─────────────┘  └─────────────┘                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Real-time Features

### Socket.IO Integration

The application uses Socket.IO for real-time features:

```typescript
// Connection handling (index.ts)
io.on('connection', (socket) => {
  // Join user to their room
  socket.on('join', (userId, role, employeeId) => {
    socket.join(userId);
  });

  // Typing indicators
  socket.on('typing', ({ conversationId, userId, userName }) => {
    socket.to(conversationId).emit('typing', {...});
  });

  // Disconnect handling
  socket.on('disconnect', async () => {...});
});
```

**Real-time Events:**

- User presence (online/offline)
- Typing indicators in chat
- New notifications
- Order status updates
- Message delivery

### Redis for Presence

```
┌─────────────────────────────────────────────┐
│         REDIS SOCKET PRESENCE               │
├─────────────────────────────────────────────┤
│                                              │
│  Keys:                                       │
│  ├── socket:{socketId} → userId             │
│  ├── userSockets:{userId} → [socketIds]     │
│  ├── userRole:{userId} → role               │
│  ├── activeUsers → [userIds]                │
│  ├── activePartners → [partnerIds]          │
│  └── activeEmployees → [employeeIds]       │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 10. Scheduled Jobs (Cron)

### 10.1 Auto-Order System (`dailyReport`)

Runs every minute to check stock levels and create auto-orders:

```
Cron: * * * * * (every minute)

Logic:
1. Find stores with auto_order enabled
2. Check if stock below auto_order_limit
3. Create StoreOrderOverview entry
4. Decrement stock by auto_order_quantity
5. Mark as "In_bearbeitung" (In Progress)
```

### 10.2 Appointment Reminders (`appointmentReminderCron`)

Sends reminders before scheduled appointments:

```
Cron: * * * * * (every minute)

Logic:
1. Find appointments with reminder set
2. Calculate reminder time (appointment time - reminder minutes)
3. If current time >= reminder time:
   - Send notification
   - Mark reminder as sent
```

### 10.3 Database Backup (`scheduleDailyDatabaseBackup`)

Automated daily database backups:

```
Cron: 0 3 * * * (3 AM daily) - configurable

Process:
1. Create pg_dump of PostgreSQL database
2. Upload to AWS S3
3. Store backup metadata in database
4. Delete backups older than 30 days
```

---

## 11. File Storage & Media

### AWS S3 Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    FILE STORAGE ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  UPLOAD FLOW:                                                │
│  ┌─────────┐    ┌─────────────┐    ┌──────────────────┐    │
│  │ Client  │───►│ Multer      │───►│ AWS S3           │    │
│  │ (Form)  │    │ (Upload)    │    │ (Bucket Storage) │    │
│  └─────────┘    └─────────────┘    └──────────────────┘    │
│                           │                    │              │
│                           ▼                    ▼              │
│                    ┌─────────────┐    ┌──────────────────┐    │
│                    │ Save URL    │◄───│ Return S3 URL    │    │
│                    │ to Database│    │ to Client        │    │
│                    └─────────────┘    └──────────────────┘    │
│                                                              │
│  FILE TYPES:                                                 │
│  ├── Images (products, customers)                          │
│  ├── 3D Models (.stl files)                                 │
│  ├── PDFs (invoices, prescriptions)                        │
│  └── Data Files (CSV, Excel)                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Supported File Operations:**

- Single file upload
- Multiple file upload
- File deletion
- File replacement
- Download from S3

---

## 12. Email Services

### Nodemailer Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    EMAIL SERVICE FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Application │───►│  Nodemailer  │───►│    Gmail     │  │
│  │             │    │  Transporter │    │   (SMTP)     │  │
│  └─────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
│  EMAIL TYPES:                                                │
│  ├── OTP / Password Reset                                    │
│  ├── Welcome / Partnership Invitation                       │
│  ├── Order Confirmations                                     │
│  ├── Invoice Notifications                                   │
│  ├── Exercise Program (PDF attachment)                       │
│  ├── Custom Shaft Order Notifications                        │
│  └── Suggestions / Feedback                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. Deployment Configuration

### Environment Variables

```env
# Server
PORT=1971
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret

# Email
NODE_MAILER_USER=your_email@gmail.com
NODE_MAILER_PASSWORD=your_app_password

# AWS S3
AWS_BUCKET_NAME=your_bucket_name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# App URLs
APP_URL_PRODUCTION=https://feetf1rst.tech
APP_URL_DEVELOPMENT=http://localhost:3003

# Database Backup
DATABASE_BACKUP=enabled
DATABASE_BACKUP_TIME=03:00
DATABASE_BACKUP_TIMEZONE=UTC
```

### CORS Configuration

The application allows CORS from multiple origins:

```typescript
const allowedOrigins = [
	"https://feetf1rst.tech",
	"https://partner.feetf1rst.tech",
	"https://admin.feetf1rst.tech",
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3002",
	"http://localhost:3003",
	// ... more origins
];
```

---

## 14. Development Workflow

### Setup Development Environment

```bash
# 1. Install dependencies
npm install

# 2. Setup database
# Create PostgreSQL database
createdb feetf1rst

# 3. Configure environment
cp sampole.env .env
# Edit .env with your settings

# 4. Generate Prisma Client
npx prisma generate

# 5. Run database migrations
npx prisma migrate dev

# 6. Start development server
npm run dev
```

### Available Scripts

| Command              | Description              |
| -------------------- | ------------------------ |
| `npm run dev`        | Start development server |
| `npm run build`      | Build TypeScript         |
| `npm start`          | Start production server  |
| `npx prisma studio`  | Open Prisma database GUI |
| `npx prisma migrate` | Run database migrations  |

---

## Appendix: Database Schema Details

### Enums Used

```prisma
enum Role { ADMIN, USER, PARTNER, EMPLOYEE }
enum Gender { MALE, FEMALE, UNISEX }
enum OrderStatus { Warten_auf_Versorgungsstart, In_Fertigung, Verpacken_Qualitätssicherung, Abholbereit_Versandt, Ausgeführt }
enum Priority { Dringend, Normal }
enum StoreType { milling_block, rady_insole }
enum paymnentStatus { Privat_Bezahlt, Privat_offen, Krankenkasse_Ungenehmigt, Krankenkasse_Genehmigt }
enum paymnentType { insurance, private, broth }
enum conversationType { Private, Group }
enum memberRole { Partner, Employee }
enum messageSenderType { Partner, Employee }
```

### Indexes for Performance

The database schema includes strategic indexes for:

- Customer search (partnerId + name)
- Order lookup (partnerId + orderNumber)
- Status filtering (partnerId + status)
- Date-based queries (createdAt)
- Full-text search optimization

---

## Visual Diagrams Summary

### System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client   │────►│   Express   │────►│  PostgreSQL │
│  (React)   │     │   Server    │     │  (Prisma)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌─────────┐  ┌──────────┐
         │ Redis  │  │  S3     │  │ Socket.IO│
         │(Cache) │  │ (Files) │  │(Real-time)│
         └────────┘  └─────────┘  └──────────┘
```

### Data Flow

```
Request → Auth Check → Controller → Service → Database
                ↑                              │
                └──────── Response ───────────┘
```

---

_Document generated for FeetF1rst CRM System_
_Version: 1.0.0_
_Last Updated: 2026-03-16_
