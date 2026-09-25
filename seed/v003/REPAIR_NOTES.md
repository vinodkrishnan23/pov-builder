# Repair notes

The validator received the symbolic `<pageSize>` value for QP-1, but MongoDB cursor `limit` requires an integer. This v003 replacement records deterministic integer pagination value `10` for QP-1 and the other page-size patterns, plus deterministic vector limits (`topK=5`, `numCandidates=20`).
