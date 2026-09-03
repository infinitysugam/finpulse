# FinPulse

A full-stack personal finance platform with accounts, investments, loans, budgeting, subscriptions, goals, fitness tracking, and an AI financial advisor agent. Built with **Django + Django REST Framework** on the backend and **React + Vite + Tailwind CSS** on the frontend.

## Features

- **Dashboard** – Net worth, account balances, cash flow, portfolio allocation, and financial health snapshots.
- **Accounts** – Track bank accounts, credit cards, and cash. Credit-card utilization is auto-synced with linked loans.
- **Transactions** – Categorize income and expenses, view spending by category, and manage recurring transactions.
- **Loans** – Track loan balances, interest rates, monthly payments, and amortization progress.
- **Investments** – Build portfolios, manage holdings and trades, refresh live prices, and run wealth projections.
- **Budgets** – Create monthly budgets, track week-by-week actuals, auto-approve, and run an optimizer to recommend savings.
- **Subscriptions** – Monitor recurring subscriptions and their monthly/annual cost.
- **Goals** – Define savings goals with target amounts, deadlines, and progress tracking.
- **Screener** – Screen stocks and crypto with technical & fundamental scoring, Fear & Greed index, news, and Reddit buzz.
- **Fitness** – Track workouts and connect fitness to overall wellness spending.
- **AI Agent** – Chat with FinPulse AI, a personal financial advisor powered by Anthropic Claude. It can call live financial tool functions to answer questions about net worth, spending, investments, budget, loans, market data, and more.

## Tech Stack

### Backend

- Python 3.12+
- Django 6.x & Django REST Framework 3.x
- JWT authentication via `djangorestframework-simplejwt`
- SQLite (default) / PostgreSQL (production-ready via `psycopg2-binary`)
- `yfinance` for live market data
- `anthropic` SDK for the AI agent
- `cryptography` for field-level encryption of sensitive financial data

### Frontend

- React 19 + Vite
- Tailwind CSS 4
- React Router 7
- TanStack Query (React Query)
- Recharts for data visualization
- React Hook Form
- Zustand for state management

## Project Structure

```
finpulse/
├── backend/                  # Django project config
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── pages/            # Dashboard, Accounts, AIAgent, etc.
│   │   ├── components/
│   │   └── store/
│   └── package.json
├── accounts/
├── transactions/
├── loans/
├── investments/
├── ai_agent/                 # Claude tool-use agent and tools
├── budget/
├── subscriptions/
├── goals/
├── screener/                 # Market screener engine
├── fitness/
└── users/                    # Custom user model with JWT auth
```

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/infinitysugam/finpulse.git
cd finpulse
```

### 2. Backend setup

```bash
# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your SECRET_KEY, database credentials, API keys, etc.

# Run migrations
python manage.py migrate

# Create a superuser (optional)
python manage.py createsuperuser

# Start the development server
python manage.py runserver
```

The backend will be available at `http://127.0.0.1:8000`.

### 3. Frontend setup

In a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start the Vite dev server
npm run dev
```

The frontend will be available at `http://127.0.0.1:3000` and proxies `/api` requests to the Django backend.

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
DEBUG=True
SECRET_KEY=your-secret-key-here-change-in-production

# Database (defaults to SQLite if not provided)
DATABASE_NAME=finpulse_db
DATABASE_USER=finpulse_user
DATABASE_PASSWORD=your_db_password
DATABASE_HOST=localhost
DATABASE_PORT=5432

ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000

# AI Agent (Anthropic) — required for the FinPulse AI chat
ANTHROPIC_API_KEY=your-anthropic-key

# Optional: market screener integrations
NEWS_API_KEY=your-newsapi-key
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret

# Optional: Telegram notifications
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
```

## API Overview

All endpoints are prefixed with `/api/`.

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register/` | Register a new user |
| `POST /api/auth/login/` | Obtain JWT access/refresh tokens |
| `POST /api/auth/token/refresh/` | Refresh JWT access token |
| `GET /api/accounts/` | List and create accounts |
| `GET /api/transactions/` | List and create transactions |
| `GET /api/loans/` | List and create loans |
| `GET /api/investments/` | Portfolios, holdings, trades, projections |
| `POST /api/ai/chat/` | Chat with the FinPulse AI agent |
| `GET /api/subscriptions/` | Recurring subscriptions |
| `GET /api/goals/` | Savings goals |
| `GET /api/screener/` | Stock/crypto screening and Fear & Greed |
| `GET /api/budget/` | Budgets and weekly actuals |
| `GET /api/fitness/` | Fitness activities |

## AI Agent

The AI agent (`ai_agent/agent.py`) is a tool-calling assistant built on Anthropic Claude. It has access to live financial tools such as:

- `get_transactions` – fetch and filter transactions
- `get_spending_by_category` – category spending totals
- `get_net_worth` and `get_cash_flow`
- `get_accounts` and `get_loans`
- `get_investments`, `get_portfolio_summary`
- `get_budget_status`, `get_subscriptions`, `get_goals`
- `get_market_data` and `run_screen` for market insights

The agent decides which tools to call and can invoke multiple tools in parallel for broad questions like "How am I doing financially?"

## Screener

The screener engine (`screener/engine.py`) fetches market data via `yfinance` and scores assets by technical and fundamental indicators. It supports watchlists, screen history, Fear & Greed sentiment, news headlines, and AI-powered screener Q&A.

## Field Encryption

Sensitive financial fields are encrypted at the application level using `django-cryptography` with an encryption key derived from `FIELD_ENCRYPTION_KEY`. In production, store this key in a secrets manager.

## Development Notes

- The backend uses SQLite by default for quick local development; switch to PostgreSQL in production.
- JWT access tokens expire in 60 minutes and refresh tokens expire in 7 days.
- CORS is configured for `http://localhost:3000` in development.

## License

This project is open source under the MIT License.

---

Built by [Sugam Mishra](https://sugammishra.com).
