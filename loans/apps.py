from django.apps import AppConfig


class LoansConfig(AppConfig):
    name = 'loans'

    def ready(self):
        import loans.signals  # noqa: F401
