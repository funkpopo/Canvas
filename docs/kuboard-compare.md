# Kuboard Feature Parity – Canvas

This document outlines Canvas features mapped to Kuboard-equivalent capabilities, plus current gaps and roadmap.

Implemented parity
- Workload management: Deployments, StatefulSets, DaemonSets, Jobs, CronJobs (detail pages, YAML edit, delete; scale where applicable)
- Pods: list/filter, delete (grace/force), detail with logs (stream), exec terminal, port-forward command helper
- Networking: Ingress and NetworkPolicy list, YAML view/edit, delete
- Config: ConfigMap and Secret management (Secret base64-safe edit)
- Cluster: nodes (cordon/uncordon, drain, labels/taints edit), namespaces, services, storage (PVC browser)
- Metrics: cluster capacity, container series when metrics-server available
- Realtime: WebSocket event updates for core workloads
- Docs: Quick start, cluster onboarding

In progress / planned
- Ephemeral container debug for Pods
- HPA multi-metric configuration (resources/pods/external)
- CRD catalog and generic GVK CRUD (schema-aware when available)
- Helm release management (opt-in, sandboxed)
- RBAC-backed capability matrix + UI gating; optional OIDC login
- Monitoring: alertmanager webhook, more event resource coverage
- Storage UX: PVC browser enhancements (mkdir/delete/zip)

Notes
- High-privilege operations (exec/port-forward) are feature-flagged and intended to be auditable.

