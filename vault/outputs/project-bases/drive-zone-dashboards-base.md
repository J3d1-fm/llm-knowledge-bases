---
id: drive-zone-dashboards-project-base
title: Drive Zone Dashboards Project Base
type: ProjectBase
status: Ready
path: vault/outputs/project-bases/drive-zone-dashboards-base.md
summary: Routing base for Drive Zone dashboard docs, devtodev funnel work, pROAS pipeline specs, and UA control center handover material.
updatedAt: 2026-07-02
tags:
  - project-bases
  - drive-zone
  - analytics
  - dashboard
  - ua
  - devtodev
---
# Drive Zone Dashboards Project Base

## Current State

Drive Zone dashboard documents were included as final useful handover material. The sweep classified the dashboard docs and specs as documentation work, while intentionally avoiding raw account exports or sensitive local artifacts.

## Source Documents In Handover ZIP

- `drive_zone/product_dashboard/README.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/README.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/TECHNICAL_DOCUMENTATION.txt`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/CHANGELOG.txt`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/technical_spec.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/product_dashboard_tz.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/metric_definitions.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/metric_glossary.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/data_availability_matrix.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/event_params_inventory.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/hourly_backlog.md`
- `drive_zone/product_dashboard/devtodev_funnel_dashboard/docs/ux_notes.md`
- `drive_zone/proas_dashboard/README.md`
- `drive_zone/proas_dashboard/docs/proas_dashboard_technical_docs.txt`
- `drive_zone/proas_dashboard/docs/CHANGELOG.txt`
- `drive_zone/proas_dashboard/docs/feature_spec_new_pipeline_2026-05-21.md`
- `drive_zone/proas_dashboard/docs/feature_spec_agent_pipeline_readiness_contract_2026-05-22.md`
- `drive_zone/proas_dashboard/docs/feature_spec_google_ads_api_direct_source_2026-05-28.md`
- `drive_zone/proas_dashboard/docs/feature_spec_event_driven_review_gates_2026-05-29.md`
- `drive_zone/proas_dashboard/docs/feature_spec_dashboard_widget_filters_ui_2026-06-01.md`
- `drive_zone/proas_dashboard/docs/feature_spec_pipeline_no_stall_development_lane_2026-06-01.md`
- `drive_zone/proas_dashboard/docs/feature_spec_source_filter_options_contract_2026-06-07.md`
- `drive_zone/ua_control_center/README.md`
- `drive_zone/ua_control_center/control_center/docs/TECHNICAL_DOCUMENTATION.txt`
- `drive_zone/ua_control_center/control_center/docs/CHANGELOG.txt`

## Next Entry Points

- Use this base to find product dashboard metric contracts and pROAS pipeline specs.
- Before running any analytics job, verify current source availability and account credentials live.
- Keep implementation-ready specs separate from raw exports and credential material.

## Safety Notes

- No raw devtodev exports, account bindings, or credential files were moved into the handover package.
- Any future data pull should be treated as a fresh data-access operation, not inferred from this base.
