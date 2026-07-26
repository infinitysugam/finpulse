from django.apps import AppConfig


class InvestmentsConfig(AppConfig):
    name = 'investments'

    def ready(self):
        import investments.signals  # noqa: F401
