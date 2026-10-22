<div align="center">
  <h1>Yiqi Workshop WMS</h1>
  <p><strong>Warehouse management for networks, inventory, and inbound/outbound execution</strong></p>
  <p>An inventory-identity and task-centered roadmap for appointments, receiving, putaway, picking, verification, shipping, and traceability.</p>

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

## Positioning

Yiqi Workshop WMS is the warehouse-management application for Yiqi Workshop. Its target is a traceable execution loop across warehouse, zone, location, material, lot/serial identity, inventory state, inbound, internal movement, outbound, and cycle-count adjustment.

Authentication, tenancy, navigation, authorization, layout, shared components, stores, and the common Supabase client remain owned by [`art-supabase-pro`](https://gitee.com/art-si/art-supabase-pro). MDM and its authoritative sources provide warehouse, location, and material identities.

## Current Status

WMS is currently in the business implementation preparation stage. The independent application shell, platform runtime, dynamic menu, role access, and warehouse workbench are complete. Inventory ledgers and inbound, internal, outbound, and counting workflows remain planned work; the repository does not present demonstration data as live inventory.

| Area | Status | Target |
| --- | --- | --- |
| Application foundation | Complete | Standalone runtime, platform loading, shared theme/navigation, and role access |
| Warehouse foundation | Pending integration | Warehouses, zones, locations, containers, materials, and storage constraints |
| Inventory ledger | Planned | Inventory identity, lot/serial tracking, state, allocation, holds, and availability |
| Warehouse execution | Planned | Appointments, receiving, putaway, replenishment, moves, picking, verification, shipping, and returns |
| Operations optimization | Planned | Count variances, alerts, turnover, capacity, productivity, and strategy optimization |

## Target Flow

```text
Inbound appointment
  → receiving
  → putaway and inventory creation
  → replenishment / movement / counting
  → wave / picking / verification
  → shipping handoff
  → inventory, lot, and task traceability
```

## Run Locally

Requirements: Node.js `>= 22.0.0` and pnpm `>= 11.9.0`.

```powershell
pnpm install
pnpm dev
```

The default development URL is `http://localhost:3018`.

```powershell
pnpm check
pnpm build
pnpm preview
```

Production output is written to `docs/` with `/art-supabase-wms/` as the default public base path.

## Platform Collaboration and Security

Commit and push WMS changes here, then update the `modules/art-supabase-wms` gitlink in the platform repository. Cross-domain data must use purpose-specific, minimum-field, tenant-isolated API/RPC contracts. Inventory changes must be driven by authorized documents and immutable movements rather than direct balance edits; UI visibility is never the final authorization boundary.

## License

Licensed under [MulanPSL-2.0](LICENSE).
