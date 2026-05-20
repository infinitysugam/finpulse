-- Run this as the PostgreSQL superuser (e.g. postgres) to bootstrap the DB.
-- Usage: psql -U postgres -f scripts/setup_db.sql

CREATE USER finpulse_user WITH PASSWORD 'finpulse_password';
CREATE DATABASE finpulse_db OWNER finpulse_user;
GRANT ALL PRIVILEGES ON DATABASE finpulse_db TO finpulse_user;

-- Extensions
\c finpulse_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
