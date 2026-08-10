# PriorPilot

## Overview

Prior authorization is one of the most repetitive administrative processes in healthcare. Before many medications or treatments can be approved, providers must gather patient records, review clinical history, and complete insurer specific documentation. This process delays patient care and takes valuable time away from clinicians.

I built PriorPilot to explore how AI can reduce this administrative burden. PriorPilot securely retrieves patient data from Epic FHIR APIs, uses an AI model to analyze the patient's clinical information, and generates a structured prior authorization summary that clinicians can review before submission. My goal was not to replace clinical decision making, but to reduce the amount of manual work required to prepare a prior authorization request.

## Motivation

I wanted to investigate whether modern AI agents could automate one of healthcare's most time consuming workflows while maintaining interoperability and secure access to patient data.

Rather than asking clinicians to manually search through multiple records, I designed PriorPilot to collect structured clinical data, organize the relevant information, and present it in a concise format that supports the prior authorization process.

## Features

* Secure authentication using Auth0
* OAuth credential management with Auth0 Token Vault
* Integration with Epic FHIR APIs
* Retrieval of structured patient clinical data
* AI generated prior authorization summaries
* Reviewable outputs that allow clinicians to verify information before submission

## How It Works

The application follows the workflow below:

1. I authenticate the user through Auth0.
2. I securely retrieve OAuth credentials using Auth0 Token Vault.
3. I request patient data from Epic FHIR APIs.
4. I extract relevant clinical information including diagnoses, medications, allergies, and laboratory results.
5. I send the structured patient information to the AI model for analysis.
6. I generate a structured prior authorization summary that can be reviewed before submission.

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

### Backend

* Node.js
* Express.js

### Authentication

* Auth0
* Auth0 Token Vault

### Healthcare Standards

* SMART on FHIR
* Epic FHIR APIs

### AI

* Openai

## Repository Structure

```text
frontend/
    React application and user interface

backend/
    Express server
    Authentication
    FHIR integration
    AI orchestration

docs/
    Architecture and supporting documentation

README.md
```

## Getting Started

### Clone the repository

```bash
git clone <repository-url>
cd priorpilot
```

### Install dependencies

Backend

```bash
cd backend
npm install
```

Frontend

```bash
cd frontend
npm install
```

### Configure environment variables

Create a `.env` file containing the required credentials.

```env
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

EPIC_CLIENT_ID=
EPIC_CLIENT_SECRET=

LLM_API_KEY=
```

I do not store API keys, passwords, or sensitive information in this repository.

### Run the backend

```bash
cd backend
npm run dev
```

### Run the frontend

```bash
cd frontend
npm run dev
```

## Current Capabilities

The current implementation demonstrates the complete proof of concept.

* User authentication
* Secure token management
* Epic FHIR integration
* Patient data retrieval
* AI assisted clinical analysis
* Prior authorization summary generation

## Limitations

This project is a hackathon prototype.

The application currently depends on external services including Auth0, Epic FHIR, and an LLM provider.

The generated summaries should always be reviewed by healthcare professionals before submission. PriorPilot is designed to support clinicians rather than replace clinical judgement.

The current implementation focuses on demonstrating an end to end workflow rather than supporting every insurer specific authorization process.

## Future Improvements

If I continue developing PriorPilot, I would like to:

* Support insurer specific authorization forms
* Add explainable AI with evidence linked to individual FHIR resources
* Introduce confidence scoring for generated recommendations
* Expand support for additional FHIR resources
* Add automated evaluation and benchmarking
* Improve error handling and production monitoring
* Integrate directly into clinical workflows

## Acknowledgements

This project was built using Auth0 Token Vault, Epic SMART on FHIR APIs, and Claude to demonstrate how AI can reduce the administrative burden associated with prior authorization while maintaining secure access to healthcare data.
