# PriorPilot


Top 5 Projects — NeuralSprint Hackathon


**An AI agent that drafts prior authorization requests from real patient FHIR data — so clinicians spend less time on paperwork and more time on patients.**


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

checkout demo here! : https://youtu.be/Q4ojHaKIl0A 

- **Real:** Auth0 authentication and Token Vault token exchange, the CIBA consent flow, OpenAI API calls, the full workflow orchestration, and the Playwright-driven portal submission.
- **Simulated:** Epic FHIR data falls back to a static demo dataset (shaped like real FHIR resources) when a live sandbox connection isn't configured, and the insurer portal is a simulated one since no hackathon-accessible payer API exists.

-- **Screenshots** 
<img width="1924" height="1008" alt="Home page" src="https://github.com/user-attachments/assets/9bf13e92-4853-45b7-a2d9-3258f0ac0ece" />
<img width="1388" height="1004" alt="Login page with Auth0" src="https://github.com/user-attachments/assets/d1d514f9-4f4c-4201-b9c8-624034ef7eae" />
<img width="1922" height="1018" alt="Landing page" src="https://github.com/user-attachments/assets/65d1fc60-0710-4b10-ad6b-88918f02eeb3" />
<img width="1906" height="1006" alt="patient consent" src="https://github.com/user-attachments/assets/792bef79-6cc3-4683-a9b6-e225ab76a346" />
<img width="1920" height="1020" alt="Drafted PA form" src="https://github.com/user-attachments/assets/af117659-95de-430e-9884-ce3c88d8bb5e" />
<img width="1340" height="1036" alt="image" src="https://github.com/user-attachments/assets/ed27ebfb-651f-4e4d-aca5-36066b174f7f" />


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
# Required
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_BASE_URL=
AUTH0_SECRET=
AUTH0_AUDIENCE=
AUTH0_TOKEN_VAULT_URL=
SESSION_SECRET=

# Optional — omit EPIC_CLIENT_ID to fall back to demoFHIR.service.ts,
# or set USE_DEMO_FHIR explicitly to force one path or the other
EPIC_CLIENT_ID=
EPIC_CLIENT_SECRET=
EPIC_FHIR_BASE_URL=
USE_DEMO_FHIR=

# Optional — AI drafting
OPENAI_API_KEY=
OPENAI_MODEL=

# Optional — defaults shown
FRONTEND_URL=http://localhost:5173
BACKEND_BASE_URL=http://localhost:3001
PORT=3001
```

Run it:

```bash
# backend
cd backend && npm run dev

# frontend (separate terminal)
cd frontend && npm run dev
```

## Testing

The backend has a Jest test suite covering the OpenAI drafting service and the prior auth routes:

```bash
cd backend && npm run test
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
