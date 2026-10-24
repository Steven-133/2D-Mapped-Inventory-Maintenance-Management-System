 HEAD
# MRO Warehouse Management System (WMS)
### Maintenance, Repair, and Operations (MRO) Digital Twin & Inventory Platform

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PHP](https://img.shields.io/badge/PHP-8.2-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![MySQL / MariaDB](https://img.shields.io/badge/MySQL-10.4%20MariaDB-4479A1?logo=mysql&logoColor=white)](https://mariadb.org/)
[![Konva.js](https://img.shields.io/badge/Konva.js-10.0-0D99FF)](https://konvajs.org/)
[![License](https://img.shields.io/badge/Academic-Thesis%20Project-green)](#)

---

##  Repository Short Description (For GitHub About Section)

> **"A full-stack Maintenance, Repair, and Operations (MRO) Warehouse Management System featuring an interactive 2D digital twin floor map, real-time inventory and lifespan tracking, barcode/QR code generation, analytics, and role-based access control."**

---

##  Overview

The **MRO Warehouse Management System** is a full-stack, enterprise-grade inventory solution engineered specifically for **Maintenance, Repair, and Operations (MRO)** facilities. MRO environments face unique operational hurdles: high part diversity, critical equipment spare tracking, shelf-life and expiration constraints, and the need for rapid item retrieval during maintenance downtime.

This project delivers an interactive **2D Digital Twin** of the warehouse floor, allowing administrators and staff to visually layout racks, locate parts down to precise coordinates, monitor stock thresholds, track item lifespans, execute check-in/check-out/defective workflows, and generate real-time analytics and audit reports.

---

##  Core Features

###  1. Interactive 2D Digital Twin (Warehouse Floor Map)
- **Visual Canvas (Powered by Konva.js)**: Drag-and-drop rack positioning on a 1600x900 grid canvas.
- **Dynamic Color Coding**: Area/zone customization with contrast-aware labeling and color legends.
- **Visual Rack Inspection**: Click any rack to view stored items, quantities, capacity, and current allocations.
- **Real-Time Visual Alerts**: Racks blink with red outlines when items inside trigger low stock or expiry alerts.
- **Layout Persistence**: Save, load, and update warehouse grid configurations dynamically to the database.

###  2. Smart MRO Inventory & Lifespan Management
- **Detailed Part Attributes**: Model number, part name, serial numbers, unit price, stock quantity, currency (PHP), category, and image upload.
- **Lifespan & Expiry Engine**:
  - Automatically calculates shelf-life states (**Good**, **Expiring within 30 days**, or **Expired**).
  - Supports flexible lifespan formats (e.g., `5y`, `6m`, `30d`, or non-expiring `N/A`).
- **Low Stock Thresholds**: Individual minimum quantity triggers alerting staff before spare shortages occur.
- **Location Auto-Resolution**: Intelligently resolves and tracks effective rack and zone locations, referencing recent transaction logs for unplaced parts.

###  3. Integrated Barcode & QR Code Engine
- **Dual Label Generator**: Switch between 1D Barcodes (`Code128` via JsBarcode) and 2D QR Codes (`qrcode.react`).
- **Printable Labels**: Generate and print standardized part label tags directly from the UI for physical bin/shelf labeling.
- **Fast Lookup**: Search and filter parts instantly using part model, name, or serial number.

###  4. Inventory Lifecycle & Transaction Auditing
- **Check-in (Stock Replenishment)**: Log newly arrived parts, update quantities, and assign target rack/zone.
- **Check-out (Issuance for Maintenance)**: Issue spare parts to maintenance jobs, track personnel, and log reasons.
- **Defective Handling & Quarantine**: Mark damaged or failing items, track quarantine status, and isolate from available stock.
- **Complete Audit Trail**: Every movement logs timestamp, user, quantity delta, item model, serial number, source/target location, and transaction notes.

###  5. Analytics & Executive Dashboard
- **Key Metrics Overview**: Real-time cards for Total SKUs, Total Quantity, Inventory Valuation, Low Stock Alerts, and Defective Counts.
- **Dead Stock Detector**: Tracks dormant inventory with configurable inactivity thresholds (e.g., 90 days default).
- **Velocity Tracker (Fast vs. Slow Movers)**: Analyzes check-out frequencies filtered across **Daily**, **Weekly**, **Monthly**, or **All-Time** periods.
- **One-Click Exporting**:
  - **PDF Export**: Clean, styled tabular audit reports powered by `jsPDF` and `jspdf-autotable`.
  - **Excel Export**: Rich `.xlsx` spreadsheets formatted with headers and column styling via `ExcelJS`.

###  6. Role-Based Access Control (RBAC) & Security
- **Admin Role**: Full system access (inventory CRUD, user administration, layout editing, system configuration, automated backup).
- **Warehouse Staff Role**: Streamlined operational access (warehouse map viewer, check-in, check-out, item lookup).
- **Password Protection**: Passwords securely hashed using standard PHP `bcrypt`.

###  7. System Configuration & Backup
- **Custom Branding**: Upload enterprise logos and customize UI header accents.
- **Automated Database Backup**: Trigger one-click MySQL backups directly to OneDrive or local storage via `backup.php`.

---

##  System Architecture

```
┌────────────────────────────────────────────────────────┐
│                   React 19 + Vite UI                   │
│      (Interactive Canvas, Modals, Analytics, Tables)   │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / JSON REST
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Apache HTTP Server                   │
│               PHP REST Endpoints (mro-api)             │
│   (Auth, Inventory CRUD, Transactions, Layout, Backup) │
└──────────────────────────┬─────────────────────────────┘
                           │ mysqli / PDO
                           ▼
┌────────────────────────────────────────────────────────┐
│                  MariaDB / MySQL Server                │
│       Database: mro_warehouse (4 Tables + Indices)     │
└────────────────────────────────────────────────────────┘
```

---

##  Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, Vite 7, React Router 7 |
| **Canvas / Digital Twin** | React Konva 19, Konva 10, HTML5 Canvas |
| **Styling & Icons** | Vanilla Modern CSS3, React Icons (`react-icons/fa`, `react-icons/fi`) |
| **Document & Label Generation** | ExcelJS, FileSaver, jsPDF, jspdf-autotable, JsBarcode, qrcode.react |
| **Backend Runtime** | PHP 8.2+ (Modular REST API) |
| **Web Server** | Apache 2.4+ (XAMPP environment) |
| **Database** | MySQL 5.7+ / MariaDB 10.4+ |

---

##  Database Schema

The database `mro_warehouse` consists of 4 core tables:

```
┌────────────────────┐       ┌────────────────────┐
│       users        │       │    app_settings    │
├────────────────────┤       ├────────────────────┤
│ id (PK)            │       │ setting_key (PK)   │
│ email (UNIQUE)     │       │ setting_value      │
│ password (bcrypt)  │       └────────────────────┘
│ name               │
│ role (admin/user)  │
│ created_at         │
└─────────┬──────────┘
          │ 1:N
          ▼
┌────────────────────┐       ┌────────────────────┐
│     inventory      │ 1:N   │    transactions    │
├────────────────────┤───────┼────────────────────┤
│ id (PK, UUID)      │       │ id (PK)            │
│ model              │       │ transaction_id     │
│ name               │       │ item_id (FK)       │
│ serial_num         │       │ item_model         │
│ qty                │       │ type (IN/OUT/DEF)  │
│ price              │       │ qty                │
│ unit, category     │       │ rack_loc, zone_loc │
│ rack_loc, zone_loc │       │ user               │
│ min_threshold      │       │ notes              │
│ lifespan, expiry   │       │ trans_date         │
│ status, date_added │       └────────────────────┘
│ image (base64)     │
└────────────────────┘
```

---

##  Quick Start Guide

### Prerequisites
1. **Node.js**: v18.0 or newer (tested on v24.11)
2. **XAMPP**: Apache 2.4+ & MariaDB/MySQL 10.4+ (installed at `C:\xampp` or standard path)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/<your-username>/MRO_Thesis.git
cd MRO_Thesis
```

---

### Step 2: Set Up Backend API & Database (XAMPP)

1. **Start Apache and MySQL**:
   - Double-click `Control_Panel.bat` or open `xampp-control.exe`.
   - Start **Apache** (Port 80) and **MySQL** (Port 3306).

2. **Deploy the PHP API**:
   - Copy the `mro-api/` directory into your XAMPP web root:
     ```powershell
     Copy-Item -Path ".\mro-api\*" -Destination "C:\xampp\htdocs\mro-api\" -Recurse -Force
     ```

3. **Import Database Schema**:
   - Open [http://localhost/phpmyadmin](http://localhost/phpmyadmin) in your browser.
   - Create a new database named: `mro_warehouse`.
   - Click **Import** and select `mro_warehouse (4).sql` from the repository root.
   - *(Alternative CLI command)*:
     ```powershell
     Get-Content -Path ".\mro_warehouse (4).sql" | & "C:\xampp\mysql\bin\mysql.exe" -u root mro_warehouse
     ```

4. **Verify Backend Health**:
   - Visit [http://localhost/mro-api/inventory.php](http://localhost/mro-api/inventory.php) in your browser. A JSON array of inventory items confirms the backend is ready.

---

### Step 3: Run the Frontend

1. Navigate to the `jreact/` directory:
   ```bash
   cd jreact
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *(Or double-click `run_frontend.bat` from the repository root)*.

4. Open your browser at:
   ```
   http://localhost:5173/
   ```

---

##  Default Credentials

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Administrator** | `admin@admin` | `admin` | Full control: Inventory CRUD, Digital Twin Map Editor, Analytics, User Management, Backups |
| **Warehouse Staff** | `user@user` | `user` | Operational: 2D Warehouse Map Viewer, Stock Check-in, Stock Check-out, Part Lookup |

---

## 📡 REST API Reference

All backend endpoints are hosted at `http://localhost/mro-api/`:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/login.php` | Authenticates user credentials via bcrypt; returns role & profile |
| `GET` | `/inventory.php` | Retrieves all inventory parts with effective location resolution |
| `POST` | `/inventory.php` | Adds a new inventory item or adjusts stock quantity |
| `PUT` | `/inventory.php` | Updates item specifications, locations, or thresholds |
| `DELETE`| `/inventory.php` | Deletes or removes an item from active inventory |
| `GET` | `/transaction.php` | Retrieves transaction audit logs (check-in, check-out, defective) |
| `POST` | `/transaction.php` | Records a new stock transaction event |
| `GET` | `/get_layout_data.php` | Fetches saved 2D warehouse map rack coordinates & colors |
| `POST` | `/save_layout.php` | Persists edited warehouse floor map layout |
| `GET` | `/racks.php` | Retrieves items assigned to a specific rack |
| `GET` | `/settings.php` | Retrieves system settings (logo, colors, dead stock days, code type) |
| `POST` | `/settings.php` | Saves updated system settings |
| `GET` | `/get_users.php` | Lists user accounts (Admin only) |
| `POST` | `/create_user.php` | Registers new staff/admin user (Admin only) |
| `POST` | `/delete_user.php` | Removes a user account (Admin only) |
| `POST` | `/change_password.php`| Updates account password |
| `GET/POST`| `/backup.php` | Generates a timestamped MySQL database backup |

---

## Project Directory Structure

```text
MRO_Thesis/
├── .gitignore               # Ignored files (node_modules, dist, logs)
├── Control_Panel.bat        # Shortcut to launch XAMPP Control Panel
├── HOW_TO_RUN.md            # Quick reference run guide
├── README.md                # Comprehensive repository documentation
├── mro_warehouse (4).sql    # Complete MySQL schema & initial seed data
├── run_frontend.bat         # One-click startup script for Vite dev server
│
├── mro-api/                 # PHP Backend REST API (Deploy to htdocs/mro-api)
│   ├── backup.php           # Database backup utility (mysqldump wrapper)
│   ├── change_password.php  # User password change handler
│   ├── create_user.php      # User registration endpoint
│   ├── db_connect.php       # Central MySQL database connection & CORS
│   ├── delete_user.php      # User removal endpoint
│   ├── get_layout_data.php  # Warehouse map layout retriever
│   ├── get_users.php        # Users list endpoint
│   ├── inventory.php        # Inventory CRUD & stock management
│   ├── login.php            # Session & bcrypt authentication
│   ├── racks.php            # Rack allocation & content queries
│   ├── save_layout.php      # Warehouse floor plan layout saver
│   ├── settings.php         # System branding & preferences handler
│   └── transaction.php      # Audit log & movement tracker
│
└── jreact/                  # Frontend Web Application (React 19 + Vite)
    ├── package.json         # Dependencies & scripts
    ├── vite.config.js       # Vite build configuration
    └── src/
        ├── main.jsx         # App entry point & client-side routes
        ├── Login.jsx        # Authentication portal
        ├── Admin_hp.jsx     # Admin central command & 2D interactive canvas
        ├── User_hp.jsx      # Staff welcome & automatic redirection
        ├── WarehouseMap.jsx # Interactive 2D Digital Twin (Staff view)
        ├── Dashboard_Analytics.jsx # Velocity metrics, dead stock, executive summary
        ├── Report_Itemlist.jsx     # Master inventory table, search, filters & exports
        ├── ManageUser.jsx   # User creation, roles, and administration
        ├── ConfigurationPage.jsx   # Branding, map colors, dead stock thresholds
        ├── LocalStorageContext.jsx # Shared global state provider
        ├── checkin.jsx      # Item check-in / stock receiving modal
        ├── checkout.jsx     # Item check-out / issuance modal
        ├── defective.jsx    # Defective part quarantine workflow
        ├── AddItemModal.jsx # Add new item dialog
        ├── EditItemModal.jsx# Modify item details dialog
        └── RemoveItemModal.jsx # Remove item dialog
```

---

##  Build for Production

To produce an optimized production bundle of the React frontend:

```bash
cd jreact
npm run build
```

The compiled assets will be placed in `jreact/dist/` ready to be served by any static file server or integrated with a production web host.

---

##  Academic Thesis Context

This platform was designed, researched, and implemented as an **Undergraduate Thesis Project** in Computer Science / Information Technology. The objective was to address real-world MRO warehouse inefficiencies—such as lost maintenance hours searching for spares, unmonitored part degradation/expiry, and disjointed inventory records—through visual digital twinning, automated auditing, and real-time operational analytics.

---

##  License
This repository is developed for academic, educational, and evaluation purposes.
=======
# 2D-Mapped-Inventory-Maintenance-Management-System
A full-stack Maintenance, Repair, and Operations (MRO) Warehouse Management System featuring an interactive 2D digital twin floor map, real-time inventory and lifespan  tracking, barcode/QR code generation, analytics, and role-based access control.

