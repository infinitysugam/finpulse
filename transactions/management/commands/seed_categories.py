from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from transactions.models import Category

User = get_user_model()

DEFAULTS = [
    # ── Expense ────────────────────────────────────────────────────────────────
    ('expense', 'Housing & Rent',       '🏠', '#6366f1'),
    ('expense', 'Utilities',            '💡', '#eab308'),
    ('expense', 'Groceries',            '🛒', '#10b981'),
    ('expense', 'Dining Out',           '🍽️', '#f97316'),
    ('expense', 'Transportation',       '🚌', '#3b82f6'),
    ('expense', 'Fuel & Gas',           '⛽', '#f59e0b'),
    ('expense', 'Healthcare',           '🏥', '#ef4444'),
    ('expense', 'Insurance',            '🛡️', '#8b5cf6'),
    ('expense', 'Entertainment',        '🎬', '#ec4899'),
    ('expense', 'Shopping & Clothing',  '🛍️', '#a855f7'),
    ('expense', 'Education',            '📚', '#06b6d4'),
    ('expense', 'Personal Care',        '💆', '#f472b6'),
    ('expense', 'Travel',               '✈️', '#0ea5e9'),
    ('expense', 'Subscriptions',        '📺', '#7c3aed'),
    ('expense', 'Fitness & Gym',        '🏋️', '#f97316'),
    ('expense', 'Gifts & Donations',    '🎁', '#e11d48'),
    ('expense', 'Childcare',            '👶', '#78716c'),
    ('expense', 'Pet Care',             '🐾', '#a16207'),
    ('expense', 'Taxes',                '🧾', '#dc2626'),
    ('expense', 'Debt Payment',         '💳', '#9333ea'),
    ('expense', 'Other Expense',        '📌', '#6b7280'),

    # ── Income ─────────────────────────────────────────────────────────────────
    ('income',  'Salary & Wages',       '💼', '#10b981'),
    ('income',  'Freelance & Contract', '💻', '#06b6d4'),
    ('income',  'Business Income',      '🏢', '#3b82f6'),
    ('income',  'Investment Returns',   '📈', '#8b5cf6'),
    ('income',  'Rental Income',        '🏘️', '#f59e0b'),
    ('income',  'Government Benefits',  '🏛️', '#6366f1'),
    ('income',  'Gift & Inheritance',   '🎀', '#ec4899'),
    ('income',  'Other Income',         '💰', '#6b7280'),

    # ── Transfer ───────────────────────────────────────────────────────────────
    ('transfer', 'Account Transfer',    '🔄', '#64748b'),
    ('transfer', 'Savings Transfer',    '🏦', '#0284c7'),
]


class Command(BaseCommand):
    help = 'Seed default categories for all users (skips existing names).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username', type=str, default=None,
            help='Seed only for this username (default: all users)',
        )

    def handle(self, *args, **options):
        username = options['username']
        users = User.objects.filter(username=username) if username else User.objects.all()

        total = 0
        for user in users:
            existing = set(Category.objects.filter(user=user).values_list('name', flat=True))
            to_create = [
                Category(
                    user=user,
                    category_type=cat_type,
                    name=name,
                    icon=icon,
                    color=color,
                    is_system=True,
                )
                for cat_type, name, icon, color in DEFAULTS
                if name not in existing
            ]
            Category.objects.bulk_create(to_create)
            count = len(to_create)
            total += count
            self.stdout.write(f'  {user.username}: {count} categories added')

        self.stdout.write(self.style.SUCCESS(f'\nDone. {total} categories created across {users.count()} user(s).'))
