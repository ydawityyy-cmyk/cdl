# 📜 CHANGELOG — CDL Site Management System

All notable changes, architectural milestones, database schema evolutions, and security hardening for the **Canaan Developers Ltd (CDL)** Construction Site & Material Management Platform.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v11.5.0] - 2026-08-20 — *Hermes Soul AI Architecture & Role-Aware Intelligence*

### 🧠 AI Advisor Architecture (Amara — Senior Site Strategist)
- **Hermes Soul Framework**: Implemented Nous Research Hermes-inspired Slot #1 `SOUL.md` persona identity + Slot #2 live database cognition memory.
- **Dynamic Role-Aware Intelligence Matrix**: AI dynamically adapts posture, technical depth, priorities, and data scoping based on active user role:
  - **Admin / Executives (`company_owner`, `ceo`)**: Strategic portfolio valuations, high-level milestone progress, system governance, and capital risks across all 12 Nairobi sites.
  - **Finance (`finance`)**: KES inventory valuation, procurement commitments, invoice vs delivery note reconciliations, and material waste tracking.
  - **Project Manager (`project_manager`)**: Assigned site stock levels, pending material requisitions (MRNs) awaiting PM sign-off, and milestone schedules.
  - **Engineers / Supervisors (`engineer`, `supervisor`)**: Concrete mix physics (Class 15/20/25/30), Kenyan standards (KS 02-1262), dry bulking math (1.55 factor), slump testing, rebar bar-bending, and raising MRNs.
  - **Procurement & Logistics (`procurement_officer`, `transfer_officer`)**: Supplier lead times, LPO processing, Central Store (Mlolongo) dispatch, delivery note verification, and transit chain-of-custody.
  - **Data Holders / Store Managers (`data_holder`, `store_manager`)**: GRN compliance, mandatory Invoice/Delivery Note fields, FIFO stock rotation, and expiry date management.
- **Google Gemini 2.5 Flash / 3.6 Flash Multi-Model Engine**: Switched to live Google Gemini API with fallback to `gemini-3.6-flash`.
- **Token Truncation Fix**: Increased `maxOutputTokens` to `3000` to prevent Gemini internal thinking tokens from truncating complex calculation responses.
- **Markdown & Viewport Expansion**: Upgraded `modules/ai_chat.js` parser to support numbered lists (`1.`, `2.`), bullet trees (`*`, `-`, `•`), code blocks, and expanded chat container to `360px` with smooth auto-scroll.

### ⚙️ System Settings & UI Enhancements
- **Admin System Settings Card**: Injected a dedicated **⚙️ System Settings — Gemini AI** management card into the Admin Dashboard (`renderAdmin`), enabling direct in-app API key updates to Supabase `public.app_settings` with live connection testing.
- **Password Visibility Eye**: Repaired the `login_ui.js` password toggle with proper relative positioning, `setAttribute` fallback, and clean state icon switching (👁 ⇄ 🔒).
- **New Chat / Clear Session**: Integrated persistent **✨ New Chat / Clear** button across all 6 dashboard headers for zero-drift conversation resets.

---

## [v11.4.0] - 2026-08-20 — *Database Schema Extensions & GRN Validation*

### 🗄️ Database & Schema
- **`public.app_settings`**: Created centralized key-value configuration table with Row Level Security (RLS) for dynamic runtime secrets management (Gemini API keys, feature toggles).
- **Perishable Stock Tracking**: Added `production_date` and `expiry_date` columns to `public.stock` table to track perishable construction chemicals and rapid-hardening cements.
- **Mandatory GRN Compliance**: Enforced validation requiring at least one valid supporting document (Invoice Number OR Delivery Note Number) on all Goods Received Notes.

---

## [v11.3.0] - 2026-08-19 — *Dynamic Role-Based Access Control (RBAC) & Hardened RLS*

### 🔐 Security & Access Control
- **17 Distinct Roles Supported**: Standardized permissions across `company_owner`, `ceo`, `admin`, `asset_manager`, `finance`, `project_manager`, `engineer`, `supervisor`, `store_manager`, `storekeeper_local`, `storekeeper_import`, `storekeeper_scaffolding`, `procurement_officer`, `transfer_officer`, `data_holder`, `site_overseer`, and `office_manager`.
- **PostgreSQL Row Level Security (RLS)**: Enforced strict site-scoped data filtering and role-based policies on `stock`, `transfers`, `material_requests`, and `audit_log`.
- **Secret Sanitization**: Removed all hardcoded credentials and database keys from client-side scripts, routing all privileged actions through serverless functions.

---

## [v11.0.0 - v11.2.0] - 2026-08-18 — *Multi-Site Synchronization & Offline Resilience*

### 🏗️ Construction Management Core
- **12 Nairobi Project Sites**: Dynamic site registry supporting Aura Peponi, Aura Riverside, Miotoni Karen, SBC, EL-Signature, OKAS, Altura Upper Hill, Whispering Oaks, Enchanting Oaks, Nyari, Central Store (GRS/Mlolongo), and Torieno Residences.
- **Service Worker & Offline Cache**: Deployed `sw.js` with background synchronization for low-connectivity construction site conditions.
- **Centralized Audit Trail**: Immutable logging of all user updates, site creation, role changes, and inventory write operations.

---

## 🌐 Production Deployments

| Deployment Date | Production URL | Deploy ID | Status |
|---|---|---|---|
| **2026-08-20** | [cdl-canaan-live.netlify.app](https://cdl-canaan-live.netlify.app) | `6a86c98da608c217e63f64c6` | 🟢 Active Production |
| **2026-08-19** | [cdllivetest.netlify.app](https://cdllivetest.netlify.app) | `6a86a9457b0fbc51f0526869` | 🟡 Staging / Legacy |

---

*Maintained by Canaan Developers Ltd Engineering Team · Nairobi, Kenya*
