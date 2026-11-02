<div align="center">
  <h1>Yiqi Workshop WMS</h1>
  <p><strong>Warehouse execution, inventory accounting, and project traceability</strong></p>
  <p>Connect SCM purchasing and sales with MES material issue and finished-goods receipt through controlled inventory documents.</p>

  <p>
    <a href="https://gitee.com/art-si/art-supabase-wms">Gitee</a>
    ·
    <a href="https://github.com/art-si/art-supabase-wms">GitHub</a>
    ·
    <a href="https://gitee.com/art-si/art-supabase-pro">Platform</a>
    ·
    <a href="https://art-si.github.io/art-supabase-doc/modules/wms">Documentation</a>
    ·
    <a href="./README.md">简体中文</a>
  </p>
</div>

## Purpose

WMS connects receipts, issues, returns, transfers, counts, and adjustments using warehouse, bin, material, lot, package, serial-number, and project identities. This repository owns warehouse pages, APIs, types, and business rules. [`art-supabase-pro`](https://gitee.com/art-si/art-supabase-pro) owns authentication, tenancy, menus, permissions, layout, shared components, and the common Supabase runtime; MDM supplies warehouse and material foundations.

## Current Capabilities

| Area | Coverage |
| --- | --- |
| Operations workbench | Authorized receiving, inventory, project-supply, and serial-trace entries and summaries |
| Initialization | Opening stock, sales/purchase obligations and returns, inventory activation, reconciliation, and closing |
| Purchasing and processing | Receipt inbound, purchase inbound/return, other inbound, entrusted-processing inbound/return, and source-document links |
| Sales | Shipment-notice-driven outbound/return, other outbound, outbound requests, and sales invoicing |
| Production | Material requests and partial issues, returns, finished receipt/return, and order/package references |
| Internal operations | Transfer requests, direct and staged transfers, assembly/disassembly, adjustments, count plans/sheets, and gains/losses |
| Inventory reporting | Current stock, immutable movements, inventory ledger, and material receipt/issue reports |
| Traceability | Project and construction-section reviews, lots, packages, and serial numbers |

Appointments, waves, picking verification, and loading handoff still require separate business documents and state machines. Direct outbound does not imply those processes are complete, and a TMS shipment handoff remains a separate integration boundary.

## Document Lifecycle and Recent Improvements

- Shared document workspaces support document/line views, source identities, filtered exports, configuration-driven forms, details, and loading/error recovery.
- Submitted documents can be withdrawn only while unapproved and not posted or pushed downstream. Each page has an independent `Withdraw` permission. Linked approval withdrawal retains workflow checks and audit history.
- Bulk deletion resolves selected lines to whole documents, deduplicates them, and checks references before confirmation with `MasterDataDeleteGuard`. Only eligible draft documents are deleted. Partial failures stop processing and report the actual outcome; posted inventory history is retained.
- Finished receipt offers staged processing and an authorized save-and-post action. One transaction validates and saves all lines, or rolls everything back. Explicit valid warehouse/bin targets remain usable when a material has no default receipt warehouse.
- Materials without lot-number management do not gain artificial display lot numbers. Internal lot identities still preserve separate traceability.

The [Chinese README](README.md) records the detailed contracts and historical verification evidence. This documentation update does not rerun those database or browser checks.

## Initialization and Inventory Rules

Opening stock establishes physical balances and cost. Opening sales/purchase documents establish outstanding obligations; they do not create physical stock movements or automatically post general-ledger vouchers. Closing initialization freezes opening documents, and normal operations must respect the activation date.

Inventory reports use authorized, tenant-scoped reads:

- Current stock lists positive lot balances.
- Movement and receipt/issue reports use immutable movement business dates.
- The period ledger reconciles `opening + inbound - outbound = closing`.
- Base and auxiliary quantities use configured material-unit conversions; missing conversions remain unknown.
- Warehouse, zone, bin, project, and period filters preserve their defined reporting scope.

## Cross-module Flow

```text
MDM materials / warehouses / bins
  → SCM receipt or shipment source
  → WMS authorized inventory documents
  ↔ MES issue requests and approved finished quantities
  → movements, balances, project review, and traceability
```

Enable materials and warehouses first. Production issue warehouses must allow picking and match the work-order type; bin-managed warehouses require available bins. SCM source lines and remaining quantities, MES approved completion quantities, project identities, and tenant consistency are validated at the server boundary.

## Local Development

Requirements: Node.js `>= 22.13.0`, pnpm `>= 11.28.2`.

```powershell
pnpm install
pnpm dev
```

Default URL: `http://localhost:3018`. Use `modules/art-supabase-wms` in a platform checkout or install the pinned platform dependency for a standalone clone. `ART_SUPABASE_PLATFORM_ROOT` can select a local platform checkout. The shared Vite factory merges platform and application environment settings; configure your backend and keep server secrets out of browser variables.

```powershell
pnpm check
pnpm build
pnpm preview
```

`pnpm check` runs boundary/UI audits, types, and ESLint. The build typechecks and writes static output to `docs/`; `VITE_BASE_URL` controls the public base path.

## Collaboration and Security

Push module changes first, then update the platform's `modules/art-supabase-wms` gitlink. Reuse platform components and purpose-specific, tenant-isolated APIs instead of importing another business module's source.

Ordinary users remain in their authenticated tenant and authorized business scope. Platform-super all/selected-tenant operations follow the platform contract. Mutations require explicit action permissions and server-side checks. Inventory balances change through controlled posting and immutable movements; UI visibility never replaces RLS or posting constraints.

## License

Licensed under [MulanPSL-2.0](LICENSE).
