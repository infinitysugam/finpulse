from django.db import models
from django.conf import settings


class Conversation(models.Model):
    """A chat session between a user and the Financial AI Agent."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='conversations',
    )
    title = models.CharField(
        max_length=255, blank=True, default='',
        help_text='Auto-generated from first user message'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'conversations'
        ordering = ['-updated_at']

    def __str__(self):
        return f'Conversation #{self.pk} — {self.user.username}'


class Message(models.Model):
    """A single turn (user or assistant) inside a Conversation."""

    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
        ('system', 'System'),
    ]

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages',
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    # Optional: store the raw tool-call payload for agentic responses
    tool_calls = models.JSONField(null=True, blank=True)
    prompt_tokens = models.PositiveIntegerField(null=True, blank=True)
    completion_tokens = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'messages'
        ordering = ['created_at']

    def __str__(self):
        return f'[{self.role}] {self.content[:60]}'
