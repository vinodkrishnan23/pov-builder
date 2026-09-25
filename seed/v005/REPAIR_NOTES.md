# Repair notes

Added the declared non-unique `dashboard_metric_snapshots` compound index with the exact specified key order. Retained `$merge` support through a separate unique index over the same merge fields in a different key order.