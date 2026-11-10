# Generative EV Battery Degradation Platform

Production-style multi-service platform for:
- ETL and sequence generation from battery data
- LSTM-VAE training and synthetic degradation trajectory generation
- Unsupervised anomaly detection
- Product-level battery health insight reports
- Full-stack app (Next.js + Express + FastAPI + local MongoDB)

## Services
- `ai-service` (FastAPI + PyTorch): ETL, train, generate, detect, health insights
- `backend` (Node.js + Express + TypeScript): Auth, dataset and experiment APIs, orchestration
- `frontend` (Next.js + React): Dashboard, explorer, generation, anomaly and report pages
- `mongodb`: local persistence layer (running on your machine)

## Architecture
- ETL: reads `.mat`, `.xls`, `.xlsx`, extracts voltage/current/temperature/capacity, computes capacity from `Q = ∫ I dt` when missing, sorts by degradation stage, and creates sliding windows (`window_size=50`)
- Model: LSTM-VAE encoder-reparameterization-decoder for unsupervised degradation representation learning
- Detection: reconstruction error + latent distance anomaly scoring
- Product layer: health scoring, remaining cycle estimate, risk stratification, recommendations
- Stage split: train on stages `0,10,20`; evaluate on `30,40,50` (with safe fallback when labels are unavailable)

## Advanced Features Included
- Latent space visualization (`/latent`, PCA or t-SNE)
- Latent interpolation trajectory generation (`/interpolate`)
- Latent trajectory drift analysis (`/drift`)
- Conditional temperature-aware generation (`temp_condition`)
- Model versioning (timestamped model artifacts)
- Experiment tracking (`experiments` and `results` collections)
- Model registry collection (`models`)

## Local Start
### Prerequisites
- MongoDB running on `mongodb://localhost:27017`
- Python virtual environment at `.venv`
- Node.js and npm

### One-time setup
```bash
npm install
npm run install:all
npm run ai:install
```

### Start all services (recommended)
```bash
npm run dev:all
```

### Start services separately (three terminals)
1. AI service
```bash
npm run ai:dev
```

2. Backend
```bash
npm run backend:dev
```

3. Frontend
```bash
npm run frontend:dev
```

### Local URLs
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- AI service: `http://localhost:8000`

## API Overview
- Backend auth: `POST /auth/register`, `POST /auth/login`
- Backend data/model APIs: `POST /datasets/upload`, `GET /datasets/uploaded`, `POST /model/train`, `POST /model/generate`, `POST /model/detect`, `POST /model/latent`, `POST /model/interpolate`, `POST /model/drift`, `POST /model/trajectory`, `POST /analysis/run`, `GET /analysis/report/:id`, `GET /analysis/compare`
- AI service: `POST /train`, `POST /generate`, `POST /detect`, `GET /health`, `POST /health`, `POST /latent`, `POST /interpolate`, `POST /drift`, `POST /trajectory`

## Data Notes
The ETL supports NASA `.mat` files as requested and also `.xls/.xlsx` files found in `raw/`.
Sliding window length defaults to 50 with configurable scaler (`minmax` or `zscore`).

## Deployment Targets
- Frontend: deploy `frontend` to Vercel
- Backend: deploy `backend` to AWS ECS/Fargate or EC2 with managed MongoDB
- AI service: deploy `ai-service` to GPU-capable instance (AWS g5, Azure NC, or GCP A2)
