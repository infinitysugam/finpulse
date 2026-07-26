import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from django.conf import settings

from .tools import TOOL_DEFINITIONS, execute_tool

logger = logging.getLogger(__name__)

# Pricing: claude-sonnet-4-6
_INPUT_COST_PER_M  = 3.00
_OUTPUT_COST_PER_M = 15.00


def calculate_cost(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens / 1_000_000 * _INPUT_COST_PER_M) + (output_tokens / 1_000_000 * _OUTPUT_COST_PER_M)


def _build_system_prompt(user) -> str:
    name = user.first_name or user.username
    today = date.today().strftime('%B %d, %Y')
    return f"""You are FinPulse AI, a personal financial advisor with real-time access to {name}'s financial data.

Today's date: {today}
User: {name}
Current net worth: ${float(user.net_worth):,.2f}

You have 9 tools to fetch live data. ALWAYS use tools to get data rather than relying on memory.
For broad questions ("summarize my finances", "how am I doing?"), call multiple tools in parallel.
Be concise, data-driven, and specific — reference actual numbers from tool results.
Use markdown: tables for comparisons, bullet points for lists, bold for key figures.
Do not invent numbers. If a tool returns no data, say so."""


def run_agent(user, conversation, user_message: str) -> dict:
    """
    Run the Claude tool-use loop.
    Returns: {text, input_tokens, output_tokens, cost_usd, system_prompt, tool_calls}
    """
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if not api_key:
        return {
            'text': 'AI Agent is not configured — add ANTHROPIC_API_KEY to .env',
            'input_tokens': 0, 'output_tokens': 0,
            'cost_usd': 0.0, 'system_prompt': '', 'tool_calls': [],
        }

    import anthropic
    from .models import Message

    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = _build_system_prompt(user)

    # Build history (exclude the current turn which is already saved)
    history = (
        Message.objects
        .filter(conversation=conversation, role__in=['user', 'assistant'])
        .exclude(content=user_message)
        .order_by('created_at')
    )
    messages = [{'role': m.role, 'content': m.content} for m in history]
    messages.append({'role': 'user', 'content': user_message})

    all_tool_calls = []
    total_input = 0
    total_output = 0
    final_text = ''
    max_rounds = 8  # safety cap on tool loops

    try:
        for _ in range(max_rounds):
            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=4096,
                system=system_prompt,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )
            total_input  += response.usage.input_tokens
            total_output += response.usage.output_tokens

            if response.stop_reason == 'tool_use':
                # Collect all tool_use blocks from this response
                tool_uses = [b for b in response.content if b.type == 'tool_use']

                # Add assistant turn (with tool calls) to message history
                messages.append({'role': 'assistant', 'content': response.content})

                # Execute all tool calls — in parallel if more than one
                if len(tool_uses) > 1:
                    with ThreadPoolExecutor(max_workers=len(tool_uses)) as pool:
                        futures = {tu.id: pool.submit(execute_tool, tu.name, tu.input, user) for tu in tool_uses}
                    results = {tid: f.result() for tid, f in futures.items()}
                else:
                    results = {tool_uses[0].id: execute_tool(tool_uses[0].name, tool_uses[0].input, user)}

                # Build tool_result blocks for the next turn
                tool_result_blocks = []
                for tu in tool_uses:
                    result_str = results[tu.id]
                    tool_result_blocks.append({
                        'type': 'tool_result',
                        'tool_use_id': tu.id,
                        'content': result_str,
                    })
                    all_tool_calls.append({
                        'tool_name': tu.name,
                        'input': tu.input,
                        'output': result_str,
                        'parallel': len(tool_uses) > 1,
                    })

                messages.append({'role': 'user', 'content': tool_result_blocks})

            else:
                # stop_reason == 'end_turn' — extract final text
                final_text = next(
                    (b.text for b in response.content if hasattr(b, 'text')),
                    ''
                )
                break

    except Exception as exc:
        logger.error('Agent error: %s', exc)
        final_text = f'Sorry, I ran into an error: {exc}'

    return {
        'text':          final_text,
        'input_tokens':  total_input,
        'output_tokens': total_output,
        'cost_usd':      calculate_cost(total_input, total_output),
        'system_prompt': system_prompt,
        'tool_calls':    all_tool_calls,
    }
