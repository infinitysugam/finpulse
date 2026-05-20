#!/usr/bin/env bash
# Quick dev-env bootstrap. Run from the project root.
set -e

echo "→ Activating venv..."
source venv/bin/activate

echo "→ Running migrations..."
python manage.py migrate

echo "→ Creating default superuser (admin / admin)..."
python manage.py shell -c "
from users.models import User
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@finpulse.dev', 'admin')
    print('Superuser created.')
else:
    print('Superuser already exists.')
"

echo "→ Starting dev server on http://127.0.0.1:8000 ..."
python manage.py runserver
