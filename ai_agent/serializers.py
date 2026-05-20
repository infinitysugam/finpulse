from rest_framework import serializers
from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'role', 'content', 'tool_calls', 'prompt_tokens', 'completion_tokens', 'created_at']
        read_only_fields = ['id', 'role', 'tool_calls', 'prompt_tokens', 'completion_tokens', 'created_at']


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'title', 'messages', 'last_message', 'created_at', 'updated_at']
        read_only_fields = ['id', 'title', 'created_at', 'updated_at']

    def get_last_message(self, obj):
        msg = obj.messages.last()
        return MessageSerializer(msg).data if msg else None


class ChatInputSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=4000)
    conversation_id = serializers.IntegerField(required=False, allow_null=True)
