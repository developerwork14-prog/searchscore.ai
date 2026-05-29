# AI Visibility Analyzer

A production-oriented SaaS scaffold for business-focused AI visibility reporting. Users enter only a brand name, website URL, and business email; the platform returns a single AI Visibility Score with business-facing insights.

## Run locally

```bash
npm install
npm run dev
```

- Web app: `http://localhost:3000`
- API: `http://localhost:4000`

## Architecture

- `apps/web`: Next.js, React, Tailwind CSS, Recharts UI.
- `apps/api`: Node.js and Express API for report generation, prompt playground, and exports.
- `packages/core`: Shared scoring, report generation, prompt simulation, and export helpers.

Technical SEO checks are modeled as hidden scoring signals and only rolled into the public business-facing score.
