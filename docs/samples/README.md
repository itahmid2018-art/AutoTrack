# AutoTrack Pro Standardized CSV Data Samples

This folder contains compatible, production-tested CSV sample datasets for the AutoTrack Pro service management platform.

---

## Sample Files Directory

| File | Primary Domain | Expected Headers | Compatible Module |
| :--- | :--- | :--- | :--- |
| **`recurring_maintenance_standard.csv`** | Client Fleet Maintenance | 7 standard columns (`customerName`, `toolBrand`, `toolCategory`, `modelNumber`, `serialNumber`, `intervalMonths`, `recommendedServiceScope`) | `Recurring Maintenance` -> `Bulk Import CSV` |
| **`recurring_maintenance_full.csv`** | Client Fleet Maintenance (Extended) | 12 full columns (`customerName`, `customerCompany`, `customerPhone`, `customerEmail`, `toolBrand`, `toolCategory`, `modelNumber`, `serialNumber`, `intervalMonths`, `lastServiceDate`, `recommendedServiceScope`, `notes`) | `Recurring Maintenance` -> `Bulk Import CSV` |
| **`spare_parts_inventory_sample.csv`** | Spare Parts Catalog | 12 inventory columns (`sku`, `barcode`, `name`, `category`, `brand`, `compatibleModels`, `unitPrice`, `costPrice`, `stockQty`, `minStockThreshold`, `unit`, `binLocation`) | `1,000 SKUs` & `Transition / Database Restore` |
| **`service_job_cards_sample.csv`** | Workshop Job Cards | 12 job ticket columns (`jobCardId`, `customerName`, `customerPhone`, `toolBrand`, `modelNumber`, `serialNumber`, `grievanceCategory`, `detailedComplaint`, `serviceType`, `preApprovedLimit`, `status`, `priority`) | `Job Cards` & `Transition / Database Restore` |

---

## 1. Recurring Maintenance Schedules (`recurring_maintenance_standard.csv`)

### Header Specifications (7 Target Columns)
1. **`customerName`** *(Required, String)*: Client name or business contractor account name.
2. **`toolBrand`** *(Optional, String)*: Tool brand. Supported values: `Bosch Professional`, `Bosch DIY (Green)`, `Makita`, `DeWalt`, `Milwaukee`, `Hilti`, `Metabo`, `Festool`, `Stihl`, `Other Vendor`. Defaults to `Bosch Professional`.
3. **`toolCategory`** *(Optional, String)*: Equipment category (e.g. `Rotary Hammer / SDS`, `Angle Grinder`, `Demolition Breaker`, `Circular / Miter Saw`, `Cordless Drill / Driver`). Defaults to `Rotary Hammer / SDS`.
4. **`modelNumber`** *(Required, String)*: Manufacturer tool model identifier (e.g. `GBH 2-26 DFR`, `GSH 11 E Professional`, `GWS 24-230 LVI`).
5. **`serialNumber`** *(Optional, String)*: Tool serial number or asset barcode. Defaults to `N/A`.
6. **`intervalMonths`** *(Optional, Integer)*: Service overhaul frequency in months (`3`, `6`, or `12`). Defaults to `6`.
7. **`recommendedServiceScope`** *(Optional, String)*: Detailed inspection checklist or overhaul instructions. Defaults to `Routine Safety Check & Carbon Brush Inspection`.

### Sample Snippet
```csv
customerName,toolBrand,toolCategory,modelNumber,serialNumber,intervalMonths,recommendedServiceScope
"Apex Industrial Construction","Bosch Professional","Demolition Breaker","GSH 11 E Professional","SN-3611C36000",6,"SDS-Max Striker O-Ring overhaul & FT 1 V 4 Lithium Gearbox Lubrication"
"Metro Electrical Contractors","Bosch Professional","Rotary Hammer / SDS","GBH 2-28 F Professional","SN-3611B67000",3,"Auto-Stop Carbon Brushes check & High Voltage Cable inspection"
"Marcus Vance Mechanics","Bosch Professional","Angle Grinder","GWS 24-230 LVI Professional","SN-3601H93000",6,"Vibration Control Side Handle & Grinding Flange bearing replacement"
```

---

## 2. Importing via UI

1. Open AutoTrack Pro and select the **`Servicing`** (Recurring Maintenance) tab.
2. Click **`Bulk Import CSV`** to launch the browser file dialog.
3. Select `recurring_maintenance_standard.csv` or `recurring_maintenance_full.csv`.
4. The system validates row completeness, calculates next due dates, and appends valid schedules directly to state.
5. Alternatively, click **`CSV Format Guide`** on the toolbar to review formatting rules and download blank templates.

---

## 3. Formatting Guidelines for Excel and Google Sheets

- **Delimiter**: Comma (`,`). Do not use semicolons or tabs.
- **Quoting**: Enclose values containing commas, slashes, or quotes in double quotes (`"..."`).
- **Encoding**: UTF-8 without BOM.
- **Dates**: Format dates as `YYYY-MM-DD` (e.g. `2026-11-15`).
