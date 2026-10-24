# MRO Thesis - Setup and How-To-Run Guide

## 1. Project Architecture

- **Frontend (`jreact/`)**: React 19 + Vite web application.
- **Backend API (`mro-api/`)**: PHP REST API endpoints deployed in `C:\xampp\htdocs\mro-api`.
- **Database (`mro_warehouse (4).sql`)**: MySQL/MariaDB database `mro_warehouse`.
- **XAMPP Location**: `C:\xampp`.

---

## 2. Default Login Credentials

| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@admin` | `admin` |
| **Warehouse Staff** | `user@user` | `user` |

---

## 3. How to Run the Website (Step-by-Step)

### Step 1: Start XAMPP (Apache & MySQL)
1. Open XAMPP Control Panel (double-click `Control_Panel.bat` or open `C:\xampp\xampp-control.exe`).
2. Click **Start** next to **Apache** (port 80) and **MySQL** (port 3306).
3. Test that the API is reachable in your browser:
   [http://localhost/mro-api/inventory.php](http://localhost/mro-api/inventory.php)

> **Note on Database**:
> The `mro_warehouse` database is already imported in MySQL.
> If you ever need to re-import or reset it:
> 1. Go to `http://localhost/phpmyadmin`
> 2. Create database `mro_warehouse` (if not exists)
> 3. Import `mro_warehouse (4).sql`

### Step 2: Start the React Frontend
You have two easy options:

**Option A (Quick Shortcut):**
- Double-click `run_frontend.bat` in this folder.

**Option B (Command Line):**
1. Open PowerShell or Command Prompt.
2. Navigate to the frontend directory:
   ```bash
   cd jreact
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

### Step 3: Open in Browser
Open:
[http://localhost:5173/](http://localhost:5173/)

Log in using the credentials above!

---

## 4. Cleanup & Optimization Performed

1. **Flattened Deeply Nested Folders**:
   - Previously: `MRO updated 1\MRO updated\MRO 1\MRO\jreact` (nested 4 levels deep).
   - Moved: `jreact/` directly to the project root `D:\EDI SHING CODING\!Work\MRO_Thesis\jreact`.
   - Removed: Empty intermediate `MRO updated 1` folders and stray empty lockfile.
2. **Archived Redundant Zip Archives**:
   - Moved `MRO updated 1 (12) (1).zip` and `mro-api 9.zip` into `_archive/` to keep the workspace clean and uncluttered.
3. **Verified Frontend Build**:
   - `npm run build` ran and passed with 0 errors.
4. **Verified XAMPP & Credentials**:
   - Verified that `mro-api` is deployed in `D:\Apps\xampp\htdocs\mro-api`.
   - Verified bcrypt hashes for default users (`admin` / `user`).
