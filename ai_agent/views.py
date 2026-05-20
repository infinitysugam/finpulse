from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer, ChatInputSerializer


class ConversationListView(generics.ListAPIView):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Conversation.objects.filter(user=self.request.user).prefetch_related('messages')


class ConversationDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Conversation.objects.filter(user=self.request.user)


class ChatView(APIView):
    """
    POST /api/ai/chat/
    Accepts a user message and an optional conversation_id.
    Creates a new conversation if none is provided.
    The actual LLM call will be wired in a later phase (ai_agent/agent.py).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChatInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_message_text = serializer.validated_data['message']
        conversation_id = serializer.validated_data.get('conversation_id')

        # Fetch or create conversation
        if conversation_id:
            conversation = Conversation.objects.filter(
                pk=conversation_id, user=request.user
            ).first()
            if not conversation:
                return Response({'detail': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            title = user_message_text[:80]
            conversation = Conversation.objects.create(user=request.user, title=title)

        # Persist user turn
        Message.objects.create(
            conversation=conversation,
            role='user',
            content=user_message_text,
        )

        # ── Placeholder: wire real LLM call here ────────────────────────────
        # from .agent import run_agent
        # assistant_response = run_agent(request.user, conversation, user_message_text)
        assistant_text = (
            "I'm your FinPulse AI Agent. LLM integration coming in the next phase. "
            f"You asked: \"{user_message_text}\""
        )
        # ─────────────────────────────────────────────────────────────────────

        assistant_msg = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=assistant_text,
        )

        conversation.save()  # bumps updated_at

        return Response({
            'conversation_id': conversation.pk,
            'message': MessageSerializer(assistant_msg).data,
        }, status=status.HTTP_200_OK)
