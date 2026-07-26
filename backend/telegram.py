import requests
from django.conf import settings


def send_telegram(message: str) -> bool:
    """Send a message to the configured Telegram chat. Returns True on success."""
    token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    chat_id = getattr(settings, 'TELEGRAM_CHAT_ID', '')

    if not token or not chat_id:
        return False

    try:
        resp = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': message, 'parse_mode': 'Markdown'},
            timeout=10,
        )
        return resp.status_code == 200
    except requests.RequestException:
        return False


def send_to_chat(token: str, chat_id: int, message: str) -> bool:
    """Send a message to an arbitrary chat (used by the bot poller)."""
    try:
        resp = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': message, 'parse_mode': 'Markdown'},
            timeout=10,
        )
        return resp.status_code == 200
    except requests.RequestException:
        return False


def build_finance_summary(user) -> str:
    from accounts.models import Account
    from loans.models import Loan
    from transactions.models import Transaction
    from investments.models import Portfolio, Holding
    from django.db.models import Sum
    from datetime import date, timedelta

    def fmt(n):
        return f'${float(n):,.2f}'

    # Accounts
    checking = Account.objects.filter(user=user, is_active=True, account_type__in=['checking', 'savings', 'cash'])
    cc = Account.objects.filter(user=user, is_active=True, account_type='credit_card')
    total_cash = checking.aggregate(t=Sum('balance'))['t'] or 0
    total_cc = cc.aggregate(t=Sum('balance'))['t'] or 0

    # Loans
    loans = Loan.objects.filter(user=user, status='active').exclude(loan_type__in=['credit_card', 'lent_to_friend'])
    lent = Loan.objects.filter(user=user, status='active', loan_type='lent_to_friend')
    total_lent = lent.aggregate(t=Sum('current_balance'))['t'] or 0

    # Investments
    holdings = Holding.objects.filter(portfolio__user=user)
    total_invested = sum(float(h.quantity) * float(h.current_price) for h in holdings)

    # Transactions last 7 days
    week_ago = date.today() - timedelta(days=7)
    txns = Transaction.objects.filter(user=user, date__gte=week_ago)
    income = float(txns.filter(transaction_type='income').aggregate(t=Sum('amount'))['t'] or 0)
    expense = float(txns.filter(transaction_type='expense').aggregate(t=Sum('amount'))['t'] or 0)
    recent = Transaction.objects.filter(user=user).order_by('-date', '-created_at')[:5]

    lines = [
        '📊 *FinPulse Financial Summary*',
        f'_{date.today().strftime("%B %d, %Y")}_',
        '',
        '💰 *Net Worth*',
        f'  {fmt(user.net_worth)}',
        '',
        '🏦 *Accounts*',
    ]
    for a in checking:
        lines.append(f'  • {a.name}: {fmt(a.balance)}')
    lines.append(f'  _Liquid total: {fmt(total_cash)}_')

    lines += ['', '💳 *Credit Cards*']
    for a in cc:
        if float(a.balance) > 0:
            lines.append(f'  • {a.name}: {fmt(a.balance)} owed')
    lines.append(f'  _CC debt total: {fmt(total_cc)}_')

    lines += ['', '📈 *Investments*']
    for p in Portfolio.objects.filter(user=user):
        val = sum(float(h.quantity) * float(h.current_price) for h in p.holdings.all())
        if val > 0:
            lines.append(f'  • {p.name}: {fmt(val)}')
    lines.append(f'  _Portfolio total: {fmt(total_invested)}_')

    lines += ['', '🏛 *Loans*']
    for l in loans:
        lines.append(f'  • {l.name}: {fmt(l.current_balance)}')
    if float(total_lent) > 0:
        lines.append(f'  💚 Owed to you: {fmt(total_lent)}')

    lines += [
        '',
        '📅 *Last 7 Days*',
        f'  Income:  {fmt(income)}',
        f'  Expense: {fmt(expense)}',
        f'  Net:     {fmt(income - expense)}',
        '',
        '🕐 *Recent Transactions*',
    ]
    for t in recent:
        sign = '+' if t.transaction_type == 'income' else '-'
        label = (t.title or t.merchant or 'Transaction')[:28]
        lines.append(f'  {sign}{fmt(t.amount)}  {label}')

    return '\n'.join(lines)
