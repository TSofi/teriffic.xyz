# Terrific Traffic

**Terrific Traffic** is a system developed in 24 hours during the **HackYeah 2025 Hackathon (October 4–5, Tauron Arena Kraków)**.  
The goal was to implement a complete working prototype based on the official challenge **Customer Journey** from Malopolska.

---

### Overview

Terrific Traffic is a community-driven platform that enables passengers to report and verify delays in public transport.  
The system integrates user-generated data with automated analysis powered by AI, providing real-time and verified information about transport disruptions.

Every user can submit a delay report for a bus or train.  
The AI service processes each report, checks its credibility using real route and timetable data, and updates the system status accordingly.  
To encourage participation, users earn points for valid reports — once a user collects 10 points, they receive one free ride.

---

### Core Functionality

- **User reports:** passengers can easily report current delays and disruptions.
- **AI validation:** OpenAI Agentic System verifies the accuracy of each report using real-time data from Supabase.
- **Reward system:** verified reports grant points; 10 points = one free ride.
- **Live updates:** validated data is immediately visible to all users.
- **Containerized architecture:** each component (frontend, backend, AI) runs in Docker for rapid deployment.

---

### Tech Stack

- **Backend:** FastAPI (Python)
- **Database:** Supabase (PostgreSQL)
- **AI Service:** OpenAI Agentic System for text analysis and verification logic
- **Frontend:** React Native
- **Deployment:** Docker, Docker Compose

---

### Architecture

The project is composed of three main services:

1. **Frontend (React Native)** – user interface for reporting and viewing delays.
2. **Backend (FastAPI)** – manages requests, stores and serves data, and communicates with AI.
3. **AI Service (Python)** – interprets user messages and validates them against transport data from the database.

All components are orchestrated with **Docker Compose** for consistent local and cloud deployment.
