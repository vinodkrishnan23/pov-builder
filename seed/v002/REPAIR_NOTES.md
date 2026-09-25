# Repair notes for v002

- Replaced the legacy `knnVector` search mapping with an Atlas Vector Search index definition using `type: "vectorSearch"`.
- Declared `embedding` as an 8-dimensional cosine vector and `status` as a filter field.
- Regenerated the complete deterministic bundle; validation is left to the runtime.
