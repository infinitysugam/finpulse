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

        from .agent import run_agent
        result = run_agent(request.user, conversation, user_message_text)

        assistant_msg = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=result['text'],
            prompt_tokens=result['input_tokens'],
            completion_tokens=result['output_tokens'],
        )

        conversation.save()

        return Response({
            'conversation_id': conversation.pk,
            'message': MessageSerializer(assistant_msg).data,
            'meta': {
                'input_tokens':  result['input_tokens'],
                'output_tokens': result['output_tokens'],
                'cost_usd':      result['cost_usd'],
                'system_prompt': result['system_prompt'],
                'tool_calls':    result['tool_calls'],
            },
        }, status=status.HTTP_200_OK)
