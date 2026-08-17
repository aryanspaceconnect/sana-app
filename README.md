# Sana

> **Personal skin intelligence, built around understanding your skin over time.**

## Live

**Live application:** https://sana-studio-1.ai.studio

Sana is a web application that combines **Perfect Corp. skin analysis** with an AI agent, persistent skin history, environmental context, and tool-assisted reasoning.

The goal is simple: instead of giving a one-time skin report, Sana builds an evolving understanding of the person using it.

---

## What Sana does

Sana turns repeated skin observations into a personal timeline.

A typical flow looks like this:

```text
Daily scan
    ↓
Perfect Corp. skin analysis
    ↓
Structured skin data
    ↓
Personal history / skin state
    ↓
AI reasoning + research + environment
    ↓
Personalized guidance
    ↓
Track the next observation
```

The system can work with:

- Facial skin-analysis results
- Previous scans and trends
- Skin incidents and reactions
- Personal goals and profile context
- Routine and scheduled events
- Weather and environmental conditions
- Web research
- Product research and recommendations
- Persistent agent memory and workspace data

---

## Try it first

The easiest way to understand Sana is to use the live application:

**https://sana-studio-1.ai.studio**

For the best experience, use the application as an actual user rather than starting from the source code. Run a facial scan, open the AI agent, and ask a question that requires context from your previous scans.

For example:

> "Look at what has changed in my skin over the last few days. What patterns do you see, and what should I focus on today?"

Then try something that requires the agent to work across multiple sources:

> "Check my recent skin history and today's environment. If you think I should change something in my routine, research it first and explain why it makes sense for me."

---

## Architecture

Sana is a React + TypeScript application with a Node/Express server and a tool-enabled AI agent.

The source is organized roughly like this:

```text
src/
├── agent/          # AI agent, tools, memory, graph/state, MCP integration
├── components/     # Product UI and application screens
├── services/       # Domain services such as environmental awareness
├── lib/            # Shared application/library code
├── utils/           # Utility functions
├── App.tsx         # Main application shell
├── main.tsx        # Frontend entry point
└── types.ts        # Shared TypeScript types

server.ts           # Node/Express backend entry point
package.json        # Scripts and dependencies
```

### Agent layer

The agent is built as a tool-using, multi-step system rather than a single chat prompt.

It has access to capabilities for things such as:

- Searching user profile and skin history
- Retrieving previous facial scans
- Recording incidents and observations
- Saving goals and structured user data
- Maintaining a persistent agent workspace
- Creating and organizing files and folders
- Scheduling regimen events
- Creating structured skincare protocols
- Web and research search
- Environmental awareness
- Dynamically connected MCP tools

The important architectural decision is that historical skin information is stored as **structured application data**. The LLM is not treated as the database. The agent retrieves the information it needs and reasons over it.

---

## Core idea: time matters

A single skin scan tells you what the skin looks like at one point in time.

Sana is designed around the idea that repeated scans are more useful because they create a personal baseline.

```text
Scan 1 → Scan 2 → Scan 3 → Scan 4 → ...
       ↘ incidents
       ↘ routine changes
       ↘ environmental context
       ↘ goals
       ↘ product history
```

That history can then be used to answer questions such as:

- What changed?
- Is this different from my normal?
- Has something similar happened before?
- What was happening around the time it changed?
- What should I investigate next?

---

## Environment-aware reasoning

Sana includes an environmental-awareness layer that can bring current and historical environmental conditions into the agent's context.

Depending on the query, the system can reason about variables such as:

- UV exposure
- Air quality / pollution
- Humidity
- Wind
- Dew point
- Vapour-pressure deficit (VPD)
- Weather changes over time

The purpose is not to treat weather as a generic recommendation trigger. It is to provide context that can be compared with the user's own skin history.

---

## Skin scan pipeline

The capture flow is designed to reduce bad inputs before they reach the analysis service.

The application uses computer-vision face detection to help the user position their face correctly. The capture interface checks the framing so the face occupies an appropriate portion of the image before a scan is submitted.

After capture:

```text
Camera frame
    ↓
Face detection / framing validation
    ↓
Perfect Corp. API
    ↓
Annotated images + structured report
    ↓
Sana processing / storage
    ↓
AI interpretation
```

This makes the scan flow more reliable than repeatedly submitting poorly framed images and waiting for the API to reject them.

---

## AI agent capabilities

The agent is designed to move beyond question-answering.

It can combine retrieval, reasoning, research, memory, and actions in one workflow.

Examples include:

**Personalized analysis**

> "Compare my recent scans and tell me what is actually changing."

**Environmental reasoning**

> "Could today's weather explain why my skin feels different? Compare it with the days when my skin was improving."

**Research**

> "Research whether this product makes sense for my current skin profile and explain your reasoning."

**Planning**

> "Create a conservative plan for the next week and put the important steps into my schedule."

**Longitudinal reasoning**

> "What have you learned about my skin that you couldn't have known from my first scan?"

---

## Technology

The current codebase includes:

- React 19
- TypeScript
- Vite
- Node.js / Express
- Google Gemini via `@google/genai`
- LangGraph / LangChain Core
- Model Context Protocol (MCP) SDK
- Firebase
- MediaPipe Tasks Vision
- Sharp
- Recharts
- Tailwind CSS
- Zod

See `package.json` for the complete dependency and script list.

---

## Running locally

### Requirements

- Node.js
- npm
- The required service/API credentials configured in environment variables

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Production build

```bash
npm run build
npm start
```

### Type-check

```bash
npm run lint
```

The application uses environment variables for credentials and service configuration.

**Do not commit API keys, secrets, or private credentials to the repository.**

---

## Project structure in more detail

### `src/agent/`

The core agent system lives here. This includes agent state, graph nodes, tool definitions, workspace/memory handling, search services, MCP integration, and agent-specific domain logic.

### `src/components/`

The primary product interface: onboarding, home/dashboard, scan experience, calendar/regimen UI, AI chat, and related application views.

### `src/services/`

Domain-specific services that feed additional context into the application and agent, including environmental awareness.

### `server.ts`

Server-side application entry point and backend wiring.

### `src/types.ts`

Shared application and agent type definitions.

---

## Design principles

### 1. Understand before recommending

Sana should use the user's actual context instead of falling back to generic advice whenever enough information exists to do better.

### 2. Memory is structured

Historical data belongs in the application data layer. The LLM should reason over retrieved context, not act as the source of truth for the user's history.

### 3. Daily use must be frictionless

Skin analysis is useful only if people repeat it. The scan flow is therefore designed to minimize interaction cost.

### 4. Depth over breadth

There are far more possible skin-related variables than can be modeled properly in a hackathon project. Sana intentionally focuses on a smaller set of factors that can be tracked and connected reliably.

### 5. Actions should follow understanding

The agent is not only there to explain. Where appropriate, it can turn reasoning into structured protocols, scheduled events, stored notes, and follow-up work.

---

## Vision

Sana starts with skin because skin is visible, measurable, and highly personal.

The long-term idea is larger: build a persistent model of how an individual's skin changes, what it responds to, and how those changes relate to the world around them.

At larger scale, privacy-preserving longitudinal data could eventually support research into skin behavior, environmental effects, product development, clinical research, and personalized treatment.

The current project is an early implementation of that idea.

**One scan tells you what your skin looks like. A history can start telling you how it behaves.**

---

## Status

Sana is an active project and continues to evolve after the hackathon submission.

The live application is available at:

**https://sana-studio-1.ai.studio**
