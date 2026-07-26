import json
import time
import requests
from datetime import date, datetime, timedelta
from django.core.management.base import BaseCommand
from django.conf import settings
from backend.telegram import build_finance_summary, send_to_chat

# In-memory conversation state keyed by chat_id
CONV = {}

HELP_TEXT = (
    '🤖 *FinPulse Bot*\n\n'
    '*Finance*\n'
    '/summary — Full financial snapshot\n\n'
    '*Fitness*\n'
    '/morning — Today\'s workout plan & goals\n'
    '/checkin — Log tonight\'s workout & stats\n'
    '/progress — This week\'s fitness summary\n\n'
    '/help — Show this message'
)


# ── Telegram helpers ──────────────────────────────────────────────────────────

def answer_callback(token, callback_id, text=''):
    try:
        requests.post(
            f'https://api.telegram.org/bot{token}/answerCallbackQuery',
            json={'callback_query_id': callback_id, 'text': text},
            timeout=5,
        )
    except Exception:
        pass


def edit_message(token, chat_id, message_id, text, reply_markup=None):
    payload = {'chat_id': chat_id, 'message_id': message_id, 'text': text, 'parse_mode': 'Markdown'}
    if reply_markup is not None:
        payload['reply_markup'] = json.dumps(reply_markup)
    try:
        requests.post(f'https://api.telegram.org/bot{token}/editMessageText', json=payload, timeout=10)
    except Exception:
        pass


def send_message(token, chat_id, text, reply_markup=None):
    payload = {'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'}
    if reply_markup:
        payload['reply_markup'] = json.dumps(reply_markup)
    try:
        resp = requests.post(f'https://api.telegram.org/bot{token}/sendMessage', json=payload, timeout=10)
        if resp.ok:
            return resp.json().get('result', {}).get('message_id')
    except Exception:
        pass
    return None


# ── Fitness helpers ───────────────────────────────────────────────────────────

def build_exercise_keyboard(exercises, checked_ids):
    buttons = []
    for ex in exercises:
        tick = '✅' if ex.id in checked_ids else '☐ '
        buttons.append([{'text': f'{tick} {ex.name}', 'callback_data': f'ex_{ex.id}'}])
    buttons.append([{'text': '💪 Submit Workout', 'callback_data': 'submit_workout'}])
    buttons.append([{'text': '😴 Rest Day — skip workout', 'callback_data': 'rest_day'}])
    return {'inline_keyboard': buttons}


def build_morning_message(user):
    from fitness.models import WorkoutDay, FitnessGoal
    dow = date.today().weekday()
    day_str = date.today().strftime('%A, %B %d')

    lines = [f'🌅 *Good morning, {user.first_name or user.username}!*', f'_{day_str}_', '']

    try:
        wd = WorkoutDay.objects.prefetch_related('exercises').get(user=user, day_of_week=dow)
        if wd.is_rest_day:
            lines += [f'😴 *{wd.name}* — Rest & recover today!', '']
        else:
            lines += [f'🏋️ *{wd.name}*', '']
            for i, ex in enumerate(wd.exercises.all(), 1):
                w = f' @ {ex.target_weight}kg' if ex.target_weight else ''
                lines.append(f'  {i}. {ex.name} — {ex.sets}×{ex.reps}{w}')
            lines.append('')
    except WorkoutDay.DoesNotExist:
        lines += ['🏋️ No workout planned for today.', 'Add your plan in FinPulse!', '']

    goal, _ = FitnessGoal.objects.get_or_create(user=user)
    lines += [
        f'💧 Water goal: *{goal.daily_water_liters}L*',
        f'🔥 Calorie goal: *{goal.daily_calories} kcal*',
    ]
    if goal.target_weight_kg:
        lines.append(f'⚖️ Target weight: *{goal.target_weight_kg}kg*')

    lines += ['', '_Send /checkin tonight to log your progress_ 📝']
    return '\n'.join(lines)


def save_checkin(user, state):
    from fitness.models import DailyLog, ExerciseLog, PlannedExercise
    log, _ = DailyLog.objects.get_or_create(user=user, date=date.today())
    log.workout_completed = bool(state.get('workout_submitted'))
    if 'water' in state:
        log.water_liters = state['water']
    if 'calories' in state:
        log.calories = state['calories']
    if state.get('weight'):
        log.body_weight_kg = state['weight']
    if 'sleep' in state:
        log.sleep_hours = state['sleep']
    log.save()

    for ex_id in state.get('checked_exercises', set()):
        try:
            planned = PlannedExercise.objects.get(id=ex_id)
            ExerciseLog.objects.get_or_create(
                daily_log=log,
                planned_exercise=planned,
                defaults={
                    'name': planned.name,
                    'sets_completed': planned.sets,
                    'reps_completed': planned.reps,
                    'completed': True,
                },
            )
        except PlannedExercise.DoesNotExist:
            pass
    return log


# ── Management command ────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Run the Telegram bot (long-polling)'

    def handle(self, *args, **kwargs):
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            self.stderr.write('TELEGRAM_BOT_TOKEN not set.')
            return

        self.stdout.write('✅ Telegram bot started. Listening for commands…')
        offset = None
        morning_sent_on = None

        while True:
            try:
                # Auto morning message between 7–8 AM once per day
                now = datetime.now()
                if 7 <= now.hour < 8 and morning_sent_on != date.today():
                    self._send_morning(token)
                    morning_sent_on = date.today()

                params = {'timeout': 30, 'allowed_updates': ['message', 'callback_query']}
                if offset:
                    params['offset'] = offset

                resp = requests.get(
                    f'https://api.telegram.org/bot{token}/getUpdates',
                    params=params, timeout=35,
                )
                for update in resp.json().get('result', []):
                    offset = update['update_id'] + 1
                    if 'message' in update:
                        self._on_message(token, update['message'])
                    elif 'callback_query' in update:
                        self._on_callback(token, update['callback_query'])

            except requests.RequestException as e:
                self.stderr.write(f'Network error: {e}')
                time.sleep(5)
            except KeyboardInterrupt:
                self.stdout.write('\nBot stopped.')
                break

    # ── Auth check ─────────────────────────────────────────────────────────────

    def _auth(self, token, chat_id):
        if str(chat_id) != str(settings.TELEGRAM_CHAT_ID):
            send_message(token, chat_id, '⛔ Unauthorized.')
            return False
        return True

    # ── Morning send ───────────────────────────────────────────────────────────

    def _send_morning(self, token):
        from users.models import User
        user = User.objects.first()
        msg = build_morning_message(user)
        send_to_chat(token, settings.TELEGRAM_CHAT_ID, msg)
        self.stdout.write(f'Morning message sent at {datetime.now().strftime("%H:%M")}')

    # ── Message handler ────────────────────────────────────────────────────────

    def _on_message(self, token, message):
        chat_id = message.get('chat', {}).get('id')
        text = (message.get('text') or '').strip()
        if not chat_id or not text or not self._auth(token, chat_id):
            return

        state = CONV.get(chat_id, {})
        step = state.get('step')

        # Mid-checkin: collect numeric answers
        if step in ('water', 'calories', 'weight', 'sleep'):
            self._checkin_reply(token, chat_id, text, state)
            return

        cmd = text.lower().split()[0]

        if cmd == '/summary':
            from users.models import User
            from backend.telegram import build_finance_summary
            send_message(token, chat_id, build_finance_summary(User.objects.first()))

        elif cmd in ('/morning', '/today'):
            from users.models import User
            send_message(token, chat_id, build_morning_message(User.objects.first()))

        elif cmd == '/checkin':
            self._start_checkin(token, chat_id)

        elif cmd == '/progress':
            self._send_progress(token, chat_id)

        elif cmd == '/help':
            send_message(token, chat_id, HELP_TEXT)

        else:
            send_message(token, chat_id, f'Unknown: `{text}`\n\nSend /help for commands.')

    # ── Callback handler (inline buttons) ─────────────────────────────────────

    def _on_callback(self, token, callback):
        query_id = callback['id']
        chat_id = callback['message']['chat']['id']
        msg_id = callback['message']['message_id']
        data = callback.get('data', '')

        if not self._auth(token, chat_id):
            answer_callback(token, query_id)
            return

        state = CONV.get(chat_id, {})

        if data.startswith('ex_'):
            ex_id = int(data[3:])
            checked = state.get('checked_exercises', set())
            if ex_id in checked:
                checked.discard(ex_id)
                answer_callback(token, query_id, '☐ Unchecked')
            else:
                checked.add(ex_id)
                answer_callback(token, query_id, '✅ Checked!')
            state['checked_exercises'] = checked
            CONV[chat_id] = state

            exercises = state.get('exercises', [])
            done = len(checked)
            total = len(exercises)
            keyboard = build_exercise_keyboard(exercises, checked)
            edit_message(
                token, chat_id, msg_id,
                f'🏋️ *Today\'s Workout*\nTap each exercise you completed:\n_{done}/{total} done_',
                reply_markup=keyboard,
            )

        elif data == 'submit_workout':
            checked = state.get('checked_exercises', set())
            total = len(state.get('exercises', []))
            answer_callback(token, query_id, '💪 Saved!')
            edit_message(token, chat_id, msg_id, f'🏋️ *Workout logged!* {len(checked)}/{total} exercises ✅')
            state.update({'step': 'water', 'workout_submitted': True})
            CONV[chat_id] = state
            send_message(token, chat_id, '💧 *How much water did you drink today?*\n_(liters, e.g. 2.5)_')

        elif data == 'rest_day':
            answer_callback(token, query_id, '😴 Rest day noted!')
            edit_message(token, chat_id, msg_id, '😴 *Rest day logged!*')
            state.update({'step': 'water', 'workout_submitted': False})
            CONV[chat_id] = state
            send_message(token, chat_id, '💧 *How much water did you drink today?*\n_(liters, e.g. 2.5)_')

    # ── Checkin flow ───────────────────────────────────────────────────────────

    def _start_checkin(self, token, chat_id):
        from fitness.models import WorkoutDay
        from users.models import User
        user = User.objects.first()
        dow = date.today().weekday()

        try:
            wd = WorkoutDay.objects.prefetch_related('exercises').get(user=user, day_of_week=dow)
        except WorkoutDay.DoesNotExist:
            wd = None

        if wd and not wd.is_rest_day and wd.exercises.exists():
            exercises = list(wd.exercises.all())
            CONV[chat_id] = {'step': 'workout', 'exercises': exercises, 'checked_exercises': set()}
            keyboard = build_exercise_keyboard(exercises, set())
            msg_id = send_message(
                token, chat_id,
                f'🏋️ *{wd.name}*\nTap each exercise you completed:\n_0/{len(exercises)} done_',
                reply_markup=keyboard,
            )
            if msg_id:
                CONV[chat_id]['message_id'] = msg_id
        else:
            CONV[chat_id] = {'step': 'water', 'checked_exercises': set(), 'workout_submitted': False}
            send_message(token, chat_id, '😴 Rest day!\n\n💧 *How much water did you drink today?*\n_(liters, e.g. 2.5)_')

    def _checkin_reply(self, token, chat_id, text, state):
        step = state['step']
        try:
            val = float(text.replace(',', '.'))
        except ValueError:
            send_message(token, chat_id, '⚠️ Please enter a number (e.g. 2.5)')
            return

        if step == 'water':
            state.update({'water': val, 'step': 'calories'})
            CONV[chat_id] = state
            send_message(token, chat_id, f'✅ Water: *{val}L*\n\n🔥 *Calories today?*\n_(e.g. 2200)_')

        elif step == 'calories':
            state.update({'calories': int(val), 'step': 'weight'})
            CONV[chat_id] = state
            send_message(token, chat_id, f'✅ Calories: *{int(val)} kcal*\n\n⚖️ *Body weight?*\n_(kg, e.g. 76.5 — type 0 to skip)_')

        elif step == 'weight':
            state.update({'weight': val if val > 0 else None, 'step': 'sleep'})
            CONV[chat_id] = state
            skip = val == 0
            send_message(
                token, chat_id,
                f'{"⏭ Skipped weight.\n\n" if skip else f"✅ Weight: *{val}kg*\n\n"}😴 *Sleep hours last night?*\n_(e.g. 7.5)_'
            )

        elif step == 'sleep':
            state.update({'sleep': val, 'step': None})
            CONV[chat_id] = state

            from users.models import User
            save_checkin(User.objects.first(), state)

            checked = len(state.get('checked_exercises', set()))
            lines = ['🎉 *All logged! Great work today* 💪', '']
            if state.get('workout_submitted'):
                lines.append(f'🏋️ Workout: {checked} exercises completed')
            else:
                lines.append('😴 Rest day')
            lines += [
                f'💧 Water: {state.get("water", "—")}L',
                f'🔥 Calories: {state.get("calories", "—")} kcal',
            ]
            if state.get('weight'):
                lines.append(f'⚖️ Weight: {state["weight"]}kg')
            lines.append(f'😴 Sleep: {val}h')
            send_message(token, chat_id, '\n'.join(lines))
            CONV[chat_id] = {}

    # ── Progress summary ───────────────────────────────────────────────────────

    def _send_progress(self, token, chat_id):
        from fitness.models import DailyLog, FitnessGoal
        from django.db.models import Avg
        from users.models import User
        user = User.objects.first()

        week_ago = date.today() - timedelta(days=7)
        logs = DailyLog.objects.filter(user=user, date__gte=week_ago)
        goal, _ = FitnessGoal.objects.get_or_create(user=user)

        if not logs.exists():
            send_message(token, chat_id, '📊 No data this week yet.\n\nUse /checkin each night!')
            return

        workouts = logs.filter(workout_completed=True).count()
        avg_water = logs.exclude(water_liters__isnull=True).aggregate(a=Avg('water_liters'))['a'] or 0
        avg_cal = logs.exclude(calories__isnull=True).aggregate(a=Avg('calories'))['a'] or 0
        avg_sleep = logs.exclude(sleep_hours__isnull=True).aggregate(a=Avg('sleep_hours'))['a'] or 0
        latest_w = logs.exclude(body_weight_kg__isnull=True).order_by('-date').first()

        water_pct = int((float(avg_water) / float(goal.daily_water_liters)) * 100) if goal.daily_water_liters else 0
        cal_pct = int((float(avg_cal) / float(goal.daily_calories)) * 100) if goal.daily_calories else 0

        lines = [
            '📊 *This Week\'s Progress*',
            f'_{week_ago.strftime("%b %d")} – {date.today().strftime("%b %d")}_',
            '',
            f'🏋️ Workouts: *{workouts}/7*',
            f'💧 Avg water: *{avg_water:.1f}L* ({water_pct}% of goal)',
            f'🔥 Avg calories: *{int(avg_cal)} kcal* ({cal_pct}% of goal)',
            f'😴 Avg sleep: *{avg_sleep:.1f}h*',
        ]
        if latest_w:
            lines.append(f'⚖️ Latest weight: *{latest_w.body_weight_kg}kg*')

        send_message(token, chat_id, '\n'.join(lines))
