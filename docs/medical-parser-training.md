## Medical Parser Training Path

PulsePilot now uses a practical extraction stack:

1. Local text extraction and OCR
2. Local medical value parsing
3. Hugging Face free-first OCR / structuring
4. OpenAI fallback when configured

To train a stronger parser model later, we need labeled records rather than raw uploads alone.

### Build a review set

Run:

```bash
node scripts/export-medical-parser-review-set.js
```

This exports the current parsed records into:

`data/medical-parser-review-set.jsonl`

Each line contains:

- filename
- provider
- confidence
- parsed diagnoses
- parsed medications
- parsed allergies
- parsed dietary flags
- parsed lab results
- parsed vitals
- stored file path

### Recommended next training workflow

1. Review each exported record and correct the extracted fields manually.
2. Create a gold dataset with:
   - OCR text
   - corrected JSON target
3. Fine-tune or prompt-tune a document extraction model only after at least a few hundred labeled examples.

### Good free-first model direction

- OCR: `microsoft/trocr-base-printed` or stronger document OCR alternatives
- Structuring: small instruction model with constrained JSON output

### Important note

A reliable medical extraction model should not be treated as “trained” until it has been evaluated against a labeled validation set. Until then, PulsePilot should keep `parsed`, `needs review`, and `low confidence` states visible in the UI.
