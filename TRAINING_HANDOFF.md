# BugTrap Secret Detector — Training Pipeline Handoff

This document is the handoff guide for completing the Gemini fine-tuning pipeline
on a Mac (or any Linux-based machine). Windows was blocked by Defender flagging
exploit-demo repos in the CredData dataset.

---

## What is already done

| File | Status | Notes |
|---|---|---|
| `agents/secret-detector-agent.md` | ✅ Created | Output schema, types, severities, ignore rules |
| `.gitignore` | ✅ Updated | `/data/` is now gitignored — protects training data |
| `data/creddata/` | ✅ Cloned | Samsung/CredData repo is cloned (metadata only, no source files yet) |
| `data/creddata/download_win.py` | ✅ Created | Windows-compatible downloader (not needed on Mac) |

## What still needs to be done (in order)

1. [Mac] Download the CredData source files via the original script
2. [Mac] Inspect a few real examples to sanity-check (spot check only — no printing full secret values)
3. Write `data/build_dataset.py`
4. Write `data/validate_dataset.py`
5. Write `scripts/upload_to_gcs.py`
6. Write `scripts/launch_tuning.py`
7. Write `scripts/test_tuned_model.py`
8. Write `data/README.md` + `requirements.txt`

---

## Step 1 — Mac setup for the download

```bash
# Python 3.10+ required (3.10 is recommended by CredData)
python3 --version

# Install CredData deps
cd data/creddata
pip install GitPython tabulate pybase62 colorama

# Run the download — clones 333 repos, takes 20-60 min depending on connection
# tmp/ can be deleted after it finishes
python3 download_data.py

# When it completes, data/creddata/data/ will exist with source files
# tmp/ can then be deleted to reclaim disk space
rm -rf tmp/
```

> The `data/` directory is gitignored. Never commit anything inside it.

---

## Step 2 — Clean up Windows leftovers first

The Windows machine partially downloaded some repos into `data/creddata/tmp/`.
Before running the Mac download, delete that directory:

```bash
cd data/creddata
rm -rf tmp/
```

If `tmp/` does not exist after pulling from git (it is gitignored), skip this step.

---

## Step 3 — Write `data/build_dataset.py`

This script converts CredData into Gemini supervised-tuning JSONL.

### Key design decisions already confirmed

**One training example = one FILE** (not one line).

**Target file extensions only:** `.js`, `.ts`, `.py`, `.json`, `.yml`, `.yaml`
(these cover ~4,575 TRUE credential lines in the dataset)

**Ground truth mapping:**
- `T` = True credential → becomes a finding in the model turn
- `F` and `X` = False/unknown → excluded from findings (file becomes a clean negative example)

**`match_redacted` format:** first 4 characters of the secret value + `****`
Extract using `ValueStart` and `ValueEnd` columns from the meta CSV.
**Never log or print the full secret value.**

**Category → agent type + severity mapping** (confirmed):

| CredData Category (partial match) | type | severity |
|---|---|---|
| `PEM Private Key`, `BASE64 Private Key`, `BASE64 encoded PEM Private Key`, `NKEY Seed`, `JWK` | `PRIVATE_KEY` | `CRITICAL` |
| `AWS Client ID`, `AWS Multi`, `AWS S3 Bucket` | `CLOUD_ACCESS_KEY` | `CRITICAL` |
| `Google API Key`, `Google Multi`, `Azure Access Token`, `Tencent WeChat API App ID`, `Akamai Credentials`, `Dropbox App secret`, `Salesforce Credentials` | `CLOUD_CREDENTIAL` | `HIGH` |
| `Key`, `API`, `MailGun API Key`, `Grafana Provisioned API Key`, `Twilio Credentials` | `API_KEY` | `HIGH` |
| `Token`, `Slack Token`, `Bearer Authorization`, `JSON Web Token`, `CMD Token`, `Basic Authorization` | `TOKEN` | `HIGH` |
| `Password`, `SQL Password`, `CMD Password`, `CURL User Password`, `CMD ConvertTo-SecureString` | `PASSWORD` | `HIGH` |
| `URL Credentials` | `CONNECTION_STRING` | `HIGH` |
| `Auth`, `Secret`, `Credential` | `API_KEY` | `HIGH` |
| `OTP / 2FA Secret`, `Firebase Domain` | `OTHER_CREDENTIAL` | `MEDIUM` |
| `Nonce`, `Salt`, `UUID` | `OTHER_CREDENTIAL` | `LOW` |

For **compound categories** (e.g. `Auth:Secret`, `Key:Secret`):
take the **highest-severity** constituent. So `Key:Secret` → `API_KEY / HIGH`.

**Split:** 90% train / 10% validation.
Dedup so files from the **same source repo** (`RepoName` column) don't straddle
train and validation (prevents data leakage).

**Balance:** keep all clean-negative examples — don't drop them.
They are the important hard negatives that teach the model NOT to hallucinate.

### Output schema (from `agents/secret-detector-agent.md`)

Each JSONL line is one training example. Vertex AI supervised-tuning format:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "File: path/to/file.py\n\n<file contents here>" }]
    },
    {
      "role": "model",
      "parts": [{ "text": "{\"findings\": [...], \"summary\": {...}}" }]
    }
  ]
}
```

The model turn is a JSON string (the detector output), serialized as a single string
inside `parts[0].text`. It must be valid JSON matching the schema in
`agents/secret-detector-agent.md`.

---

## Step 4 — Write `data/validate_dataset.py`

Asserts every JSONL line:
- Is valid JSON
- Has `contents` with two turns (user + model)
- The model turn text is itself valid JSON
- The JSON matches the detector schema (findings array + summary object)

Reports:
- Total examples
- With-findings vs empty-findings count
- Per-type breakdown
- Any lines that fail validation

---

## Step 5 — Write `scripts/upload_to_gcs.py`

Uploads `data/train.jsonl` and `data/validation.jsonl` to a **private** GCS bucket.

GCP project: `bugtrap-prod`  
Region: `us-central1`  
Bucket name: set via env var `GCS_TRAINING_BUCKET` (e.g. `bugtrap-sft-data`)

The bucket **must** be private. The script should create it if it doesn't exist,
with uniform bucket-level access and no public ACLs.

Auth: Application Default Credentials (`gcloud auth application-default login`).

---

## Step 6 — Write `scripts/launch_tuning.py`

Launches a Vertex AI Gemini supervised-tuning job.

**Before writing this script**, look up the current Vertex AI tuning API:
- Base model to tune: `gemini-2.0-flash-lite` (or the current smallest tuneable Gemini)
- Check the current tuneable model names at:
  https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning
- The JSONL schema for Vertex tuning may have changed — verify it matches what
  `build_dataset.py` produces before launching

The script should print the tuning job name/ID and a `gcloud` command to monitor it.

---

## Step 7 — Write `scripts/test_tuned_model.py`

After the tuning job completes, point the script at the tuned endpoint and run a
few held-out files (not in training) through it. Print the JSON output for manual
quality review.

Tuned endpoint will be set via env var `TUNED_MODEL_SECURITY` in `.env.local`.

---

## Step 8 — `requirements.txt` (for the Python scripts in `data/` and `scripts/`)

Pinned deps needed:
```
google-cloud-aiplatform>=1.60.0
google-cloud-storage>=2.14.0
```

---

## Security rules — follow these always

- `data/` is gitignored. **Never commit anything inside it.**
- Never print a full secret value to the console or logs.
  Use `match_redacted` = first 4 chars + `****`.
- The GCS bucket holding training data **must be private**.
- Do not store real credential values in training JSONL — CredData's
  `obfuscate_creds` step replaces them with random strings before the
  files land in `data/creddata/data/`. Build on those obfuscated files.

---

## Key file locations

```
bugtrap/
├── agents/
│   └── secret-detector-agent.md   ← output schema spec (READ THIS FIRST)
├── data/                           ← gitignored; create this on the Mac
│   ├── creddata/                   ← cloned from Samsung/CredData
│   │   ├── meta/                   ← 333 CSV files, already present
│   │   ├── download_data.py        ← original Linux/Mac download script
│   │   ├── download_win.py         ← Windows-only workaround, ignore on Mac
│   │   └── data/                   ← created by download_data.py (not present yet)
│   ├── train.jsonl                 ← created by build_dataset.py
│   └── validation.jsonl            ← created by build_dataset.py
├── scripts/
│   ├── upload_to_gcs.py            ← to be written
│   ├── launch_tuning.py            ← to be written
│   └── test_tuned_model.py         ← to be written
└── TRAINING_HANDOFF.md             ← this file
```

---

## GCP project info

- Project ID: `bugtrap-prod`
- Region: `us-central1`
- Auth: ADC — run `gcloud auth application-default login` before any script
- GCS bucket env var: `GCS_TRAINING_BUCKET`

---

## Resume prompt for Claude Code on the Mac

Paste this at the start of the session:

> I'm picking up a BugTrap training pipeline from a Windows machine.
> Read TRAINING_HANDOFF.md first, then read agents/secret-detector-agent.md.
> The CredData download (Step 1) needs to run first — run it, then write all
> the scripts listed in the handoff doc (Steps 3–8) in order.
> Follow the security rules: never print full secret values, keep data/ gitignored,
> bucket must be private.
