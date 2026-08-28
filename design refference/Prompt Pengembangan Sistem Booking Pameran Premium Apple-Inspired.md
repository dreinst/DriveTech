# ROLE

Act as a Principal Full Stack Engineer with 10+ years of experience at Apple.

You are responsible for designing, architecting, and implementing a world-class exhibition booking platform for vehicle exhibitions (cars, motorcycles, UMKM, food stalls).

Your engineering standards must match Apple internal product quality:

- Clean Architecture
- Domain Driven Design
- SOLID Principles
- Accessibility First
- Pixel Perfect UI
- High Performance
- Realtime Experience
- Production Ready
- Enterprise Grade Security
- Mobile First Responsive Design

---

# PROJECT OVERVIEW

Build a luxury exhibition booking platform based on the attached venue layout.

The platform allows:

1. Public users to view an interactive venue map.
2. Users to book available slots.
3. Admins to verify payments.
4. Real-time slot status updates.
5. Leasing integration workflow.
6. Analytics dashboard.
7. Exhibition management.

This project is dedicated to one exhibition event.

---

# DESIGN DIRECTION

## Design Philosophy

Create a visual experience inspired by:

- Apple.com
- Apple Events
- Apple Park Visitor Experience
- Apple Product Launch Presentation
- Tesla Event Booking
- Porsche Experience Center

Avoid:

- Bootstrap look
- Admin template appearance
- Cheap marketplace UI
- Generic dashboard aesthetics

The experience should feel:

- Premium
- Elegant
- Minimal
- Luxury
- High-end
- Trustworthy

---

# COLOR SYSTEM

Primary:
#0A0A0A

Secondary:
#1C1C1E

Background:
#F5F5F7

Accent:
#0071E3

Success:
#34C759

Warning:
#FF9F0A

Danger:
#FF453A

Card:
#FFFFFF

Border:
rgba(0,0,0,0.08)

---

# TYPOGRAPHY

Use:

- SF Pro Display
- SF Pro Text

Fallback:

- Inter
- Helvetica Neue
- Sans-serif

Scale:

Hero:
64px

Section:
48px

Title:
32px

Subtitle:
24px

Body:
16px

Caption:
14px

---

# RESPONSIVE REQUIREMENTS

Mobile:
320px+

Tablet:
768px+

Laptop:
1024px+

Desktop:
1440px+

Ultra Wide:
1920px+

All layouts must be fully responsive.

No horizontal scrolling.

Interactive map must support:

- pinch zoom
- drag
- touch gestures
- mouse wheel zoom

---

# LANDING PAGE

Sections:

1. Hero Section

- Large cinematic background
- Event information
- CTA Book Slot
- CTA Explore Layout

2. Interactive Venue Map

- Full SVG venue map
- Zoom controls
- Legend
- Slot availability counter

3. Available Zones

- Mobil Baru
- Mobil Bekas
- Mobil & Motor
- UMKM
- Warung

4. Statistics

- Total Slots
- Available
- Pending
- Confirmed

5. Sponsors

6. Contact

7. Footer

---

# SVG VENUE SYSTEM

Convert the attached venue JPEG into a fully detailed SVG.

Requirements:

Every slot must become an SVG object.

Examples:

Zone:
- Mobil Baru Slot 1-10
- Mobil Bekas Slot 1-30
- Mobil Motor Slot 1-14
- UMKM Slot 1-30
- Warung

Each SVG element must contain:

id
data-zone
data-slot
data-status

Example:

slot-mobil-bekas-1

slot-mobil-bekas-2

slot-umkm-15

etc.

---

# SVG INTERACTION

Hover:

- glow effect
- smooth animation

Available:

Green

Pending:

Orange

Confirmed:

Red

Selected:

Apple Blue

---

# SVG ANIMATIONS

Framer Motion

Features:

- fade
- scale
- smooth transitions
- spring physics

No excessive animations.

Everything must feel premium.

---

# BOOKING FLOW

User clicks slot

↓

Slot Detail Modal

↓

Booking Form

↓

Payment

↓

Verification

↓

Confirmed

---

# ADMIN PANEL

Sections:

Dashboard

Bookings

Slots

Payments

Tenants

Leasing

Analytics

Settings

---

# DASHBOARD

Widgets:

Revenue

Occupancy Rate

Pending Payments

Confirmed Bookings

Zone Utilization

Leasing Conversion

---

# CHARTS

Use:

- Recharts

Charts:

- Occupancy Trend
- Revenue Trend
- Zone Distribution
- Leasing Performance

---

# TECH STACK

Frontend

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- Zustand
- React Query

Backend

- Next.js Server Actions
- Supabase

Database

- PostgreSQL

Storage

- Supabase Storage

Authentication

- Supabase Auth

Realtime

- Supabase Realtime

---

# SECURITY

Implement:

- Row Level Security
- CSRF Protection
- Rate Limiting
- Input Validation
- Zod
- Secure File Upload
- Audit Logs

---

# PERFORMANCE

Target:

Lighthouse Score:
95+

Core Web Vitals:
Excellent

Page Load:
< 2s

TTFB:
< 500ms

---

# ACCESSIBILITY

WCAG AA

Keyboard Navigation

Screen Reader Support

Focus Management

High Contrast Support

---

# SEO

Metadata API

OpenGraph

Twitter Cards

Structured Data

Sitemap

Robots

---

# CODE STRUCTURE

src/

app/

components/

features/

domains/

hooks/

services/

lib/

types/

store/

actions/

repositories/

---

# DELIVERABLES

Generate:

1. Complete system architecture
2. Database schema
3. SVG venue architecture
4. Folder structure
5. API specifications
6. Admin dashboard
7. Public booking system
8. Realtime architecture
9. Mobile responsive layouts
10. Production deployment strategy
11. Docker setup
12. CI/CD pipeline
13. Testing strategy
14. Monitoring strategy
15. Complete implementation roadmap

Produce enterprise-grade code quality.