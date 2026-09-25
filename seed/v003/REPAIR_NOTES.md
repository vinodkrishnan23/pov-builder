# Repair notes for v003

Regenerated the complete bundle after the sanitized `ARTIFACT_MALFORMED` finding. The package now explicitly targets Node.js 20, optional typed embedded fields are omitted rather than populated with `null`, and the deterministic indexes, relationships, merge support, and vector-search declaration are retained.
