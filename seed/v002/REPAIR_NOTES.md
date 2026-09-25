# Repair notes

QP-1 validation passed a symbolic page-size token to the MongoDB cursor. This repair supplies the deterministic integer default `10` for QP-1's `limit` and records integer defaults for related pagination/vector placeholders. The complete deterministic seed bundle is reproduced at v002.
