# PriorPilot Architecture

## Overview

PriorPilot is split into three layers: a React frontend, an Express backend that
orchestrates the workflow, and a set of external services (Auth0, Epic FHIR, OpenAI)
that the backend talks to on the user's behalf.

```
┌─────────────┐        ┌──────────────────────────────────────────┐
│  Frontend   │  HTTP  │                 Backend                   │
│  React +    │◄──────►│              (Express API)                │
│  Vite +     │        │                                            │
│  Tailwind   │        │  controllers/  routes/  workflows/         │
└─────────────┘        └───────┬─────────┬─────────┬───────────────┘
                                │         │         │
                    ┌───────────┘         │         └───────────┐
                    ▼                     ▼                     ▼
            ┌───────────────┐   ┌─────────────────┐   ┌──────────────────┐
            │     Auth0      │   │   Epic FHIR API   │   │   OpenAI API      │
            │ + Token Vault  │   │  (or demo mode)   │   │ (drafts PA forms) │
            └───────────────┘   └─────────────────┘   └──────────────────┘
```

## Request Flow

The core logic lives in `backend/src/workflows/priorAuth.workflow.ts`, which runs
these steps in order for every prior authorization request:

1. **Check insurer requirements** — `services/insurer/requirements.service.ts` looks
   up what the target insurer needs (e.g. whether CIBA step-up consent is required).
2. **Step-up consent (CIBA)** — `services/auth/ciba.service.ts` handles the
   Client-Initiated Backchannel Authentication flow so the patient can approve access
   without the app ever seeing their Epic credentials directly.
3. **Token retrieval** — `services/auth/tokenVault.service.ts` fetches a short-lived
   Epic access token through Auth0 Token Vault, so the backend never stores long-lived
   provider secrets itself. If `useDemo` is set, this step is skipped and the demo
   sandbox path is used instead.
4. **Fetch clinical data** — `services/ehr/fhir.service.ts` calls Epic's FHIR API for
   medications, conditions, and related resources. `services/ehr/demoFHIR.service.ts`
   provides the same shape of data from a static demo dataset when a live Epic
   sandbox connection isn't available.
5. **AI drafting** — `services/ai/openai.service.ts` sends the structured FHIR data to
   OpenAI (`gpt-4.1-mini` by default) with a prompt (see `promptTemplates.ts`) that
   instructs the model to only use clinical facts present in the provided records, and
   to return a structured JSON prior authorization form plus a clinical justification
   narrative.
6. **Submission** — `services/insurer/submission.service.ts` packages the drafted form
   for submission to the (simulated) insurer endpoint.

Each step updates the request's status (`pending_consent` → ... → final state), which
the frontend polls or streams to show progress to the user.

## Key Backend Files

| File | Responsibility |
|---|---|
| `workflows/priorAuth.workflow.ts` | Orchestrates the full end-to-end request |
| `services/auth/tokenVault.service.ts` | Auth0 Token Vault integration |
| `services/auth/ciba.service.ts` | CIBA step-up consent flow |
| `services/ehr/fhir.service.ts` | Live Epic FHIR API calls |
| `services/ehr/demoFHIR.service.ts` | Static demo data fallback |
| `services/ai/openai.service.ts` | Calls OpenAI to draft the PA form and justification |
| `services/ai/agentLoop.service.ts` | Multi-step agent loop wrapping the drafting call |
| `services/insurer/requirements.service.ts` | Per-insurer requirement rules |
| `services/insurer/submission.service.ts` | Final submission packaging |

## Frontend

`frontend/src/App.tsx` handles authentication (via Auth0), lets the user pick a
patient and target medication, kicks off a workflow run, and renders the generated
prior authorization summary for clinician review before anything is submitted.

## What's Real vs. Demo

- **Real:** Auth0 authentication and Token Vault token exchange, OpenAI API calls,
  the full workflow orchestration logic.
- **Demo/mocked:** Epic FHIR data falls back to `demoFHIR.service.ts` (a static
  dataset shaped like real FHIR resources) when a live sandbox connection isn't
  configured. Insurer submission is simulated rather than sent to a real payer system,
  since no hackathon-accessible insurer API exists.

## Security Notes

- No patient credentials or long-lived Epic tokens are stored by the backend — Auth0
  Token Vault brokers short-lived tokens on demand.
- API keys and secrets are provided via environment variables and are not committed
  to the repository (see `.env.example` for the required variable names).