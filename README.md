# PriorPilot

**An AI agent that drafts prior authorization requests from real patient FHIR data — so clinicians spend less time on paperwork and more time on patients.**

Built for NeuralSprint.

## The Problem

Prior authorization is one of the most repetitive, time-consuming administrative processes in healthcare. Before many medications or treatments can be approved, providers have to gather patient records, review clinical history, and fill out insurer-specific documentation by hand. This delays patient care and eats up clinician time that should be going toward, well, patients.

## What PriorPilot Does

PriorPilot automates the *prep work* of a prior authorization request end to end:

1. Authenticates the user and securely brokers Epic access via **Auth0 Token Vault** (no long-lived provider secrets ever touch the backend)
2. Runs a **CIBA step-up consent** flow so the patient can approve data access without the app seeing their Epic credentials
3. Pulls structured clinical data — medications, conditions, labs — from **Epic FHIR APIs**
4. Feeds that data to an **AI agent loop** that drafts a structured PA form plus a clinical justification narrative, grounded only in the facts present in the records
5. Runs a real headless-browser submission to the (simulated) insurer portal
6. Surfaces everything to the clinician for review before anything is submitted — PriorPilot drafts, it never decides

## Why It's Built This Way

We didn't want a demo that just calls an LLM and prints text. We wanted to prove the *whole pipeline* — auth, interoperability, agent orchestration, and submission — could work together as something closer to production-shaped software. That's why there's a real Token Vault integration, a real CIBA consent flow, and a real Playwright-driven submission step instead of a mocked one.

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Auth | Auth0, Auth0 Token Vault, CIBA |
| Healthcare | SMART on FHIR, Epic FHIR APIs |
| AI | OpenAI (agent loop / function calling) |
| Automation | Playwright (headless-browser portal submission) |

## Architecture

```
┌─────────────┐        ┌──────────────────────────────────────────┐
│  Frontend   │  HTTP  │                 Backend                   │
│  React +    │◄──────►│              (Express API)                │
│  Vite +     │        │  controllers/  routes/  workflows/         │
│  Tailwind   │        └───────┬─────────┬─────────┬───────────────┘
└─────────────┘                │         │         │
                    ┌───────────┘         │         └───────────┐
                    ▼                     ▼                     ▼
            ┌───────────────┐   ┌─────────────────┐   ┌──────────────────┐
            │     Auth0      │   │   Epic FHIR API   │   │   OpenAI API      │
            │ + Token Vault  │   │  (or demo mode)   │   │ (drafts PA forms) │
            └───────────────┘   └─────────────────┘   └──────────────────┘
```

The core orchestration lives in `backend/src/workflows/priorAuth.workflow.ts`, which runs: check insurer requirements → CIBA step-up consent → token retrieval via Token Vault → fetch FHIR data → AI drafting → submission. Full breakdown in [`docs/architecture.md`](docs/architecture.md).

## What's Real vs. Demo

Being upfront about this since judges (rightly) dig into it:

- **Real:** Auth0 authentication and Token Vault token exchange, the CIBA consent flow, OpenAI API calls, the full workflow orchestration, and the Playwright-driven portal submission.
- **Simulated:** Epic FHIR data falls back to a static demo dataset (shaped like real FHIR resources) when a live sandbox connection isn't configured, and the insurer portal is a simulated one since no hackathon-accessible payer API exists.

## Getting Started

Clone and install:

```bash
git clone <repository-url>
cd priorpilot

cd backend && npm install
cd ../frontend && npm install
```

Create a `.env` file in `backend/` (see below for required variables — none of this is committed to the repo):

```env
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

EPIC_CLIENT_ID=
EPIC_CLIENT_SECRET=

LLM_API_KEY=
```

Run it:

```bash
# backend
cd backend && npm run dev

# frontend (separate terminal)
cd frontend && npm run dev
```

## Security Notes

- No patient credentials or long-lived Epic tokens are stored by the backend — Auth0 Token Vault brokers short-lived tokens on demand.
- API keys and secrets live in environment variables only and are gitignored.
- Generated PA summaries are always meant for clinician review before submission — PriorPilot supports clinical judgment, it doesn't replace it.

## Current Capabilities

* End-to-end auth (Auth0 + CIBA step-up consent)
* Secure, short-lived token brokering via Token Vault
* Live Epic FHIR data retrieval (with a demo-data fallback)
* AI-drafted PA summary + clinical justification narrative
* Real headless-browser submission to a simulated insurer portal

## Limitations

This is a hackathon build, so:

* It depends on external services (Auth0, Epic FHIR, an LLM provider) rather than running fully standalone
* It demonstrates one end-to-end workflow rather than every insurer's specific authorization process
* Generated summaries should always be reviewed by a healthcare professional before anything is submitted

## Future Improvements

* Support insurer-specific authorization forms
* Explainable AI — link every claim in the summary back to the specific FHIR resource it came from
* Confidence scoring for generated recommendations
* Broader FHIR resource coverage
* Automated evaluation/benchmarking of the AI drafting step
* Production-grade error handling and monitoring

## Acknowledgements

Built using Auth0 Token Vault, Epic SMART on FHIR APIs, and OpenAI, to explore how AI agents can cut down the administrative burden of prior authorization while keeping patient data access secure and auditable.