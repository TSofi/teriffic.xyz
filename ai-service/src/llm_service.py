"""LLM service for handling chat interactions with tool calling."""
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
import json
import logging
from .tools import TOOLS, ToolExecutor
from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMService:
    """Service for LLM interactions with tool calling support."""

    def __init__(self, db_service):
        """Initialize LLM service with OpenRouter client."""
        self.client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url
        )
        self.tool_executor = ToolExecutor(db_service)
        self.model = settings.model_name

    async def chat(
        self,
        messages: List[Dict[str, str]],
        max_iterations: int = 5
    ) -> Dict[str, Any]:
        """
        Process chat with automatic tool calling.

        Args:
            messages: List of message dicts with 'role' and 'content'
            max_iterations: Maximum number of tool calling iterations

        Returns:
            Dict with response and tool calls made
        """
        conversation = messages.copy()
        tool_calls_made = []
        iterations = 0

        while iterations < max_iterations:
            iterations += 1

            try:
                # Call LLM with tools
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=conversation,
                    tools=TOOLS,
                    tool_choice="auto",
                    temperature=settings.temperature,
                    max_tokens=settings.max_tokens,
                    top_p=settings.top_p,
                    extra_headers={
                        "HTTP-Referer": "https://bus-tracker-ai",
                        "X-Title": "Bus Tracker AI Assistant"
                    }
                )

                assistant_message = response.choices[0].message

                # Check if LLM wants to use tools
                if assistant_message.tool_calls:
                    # Add assistant's message with tool calls to conversation
                    conversation.append({
                        "role": "assistant",
                        "content": assistant_message.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments
                                }
                            }
                            for tc in assistant_message.tool_calls
                        ]
                    })

                    # Execute each tool call
                    for tool_call in assistant_message.tool_calls:
                        function_name = tool_call.function.name
                        function_args = json.loads(tool_call.function.arguments)

                        logger.info(f"Executing tool: {function_name} with args: {function_args}")

                        # Execute the tool
                        tool_result = await self.tool_executor.execute_tool(
                            function_name,
                            function_args
                        )

                        # Track tool call
                        tool_calls_made.append({
                            "tool": function_name,
                            "arguments": function_args,
                            "result": tool_result
                        })

                        # Add tool result to conversation
                        conversation.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": function_name,
                            "content": json.dumps(tool_result)
                        })

                    # Continue loop to let LLM process tool results
                    continue

                else:
                    # No tool calls, we have final response
                    return {
                        "response": assistant_message.content,
                        "tool_calls": tool_calls_made,
                        "iterations": iterations,
                        "conversation": conversation
                    }

            except Exception as e:
                logger.error(f"Error in LLM chat: {e}")
                return {
                    "response": "I'm sorry, I encountered an error processing your request. Please try again.",
                    "error": str(e),
                    "tool_calls": tool_calls_made,
                    "iterations": iterations
                }

        # Max iterations reached
        return {
            "response": "I apologize, but I wasn't able to complete your request. Please try rephrasing your question.",
            "tool_calls": tool_calls_made,
            "iterations": iterations,
            "max_iterations_reached": True
        }

    async def simple_query(self, query: str, context: Optional[str] = None) -> str:
        """
        Simple query without conversation history.

        Args:
            query: User query
            context: Optional context to include

        Returns:
            AI response as string
        """
        messages = []

        if context:
            messages.append({
                "role": "system",
                "content": context
            })

        messages.append({
            "role": "user",
            "content": query
        })

        result = await self.chat(messages)
        return result.get("response", "")

    def build_system_prompt(self) -> str:
        """Build system prompt for bus tracking assistant."""
        return """You are a helpful AI assistant for a real-time bus tracking system.

Your role is to help users understand the current status of bus lines, delays, and service issues.

When users ask about a bus line:
1. Use the get_bus_line_status tool to get current information
2. Check for recent reports using get_recent_reports if needed
3. Look for service alerts using check_service_alerts
4. Suggest alternatives if there are severe delays using get_alternative_routes

Always:
- Be concise and helpful
- Provide specific delay information when available
- Mention if information is from user reports (community-sourced) or official data
- Suggest alternatives when there are problems
- Use friendly, conversational language
- If you don't have data, say so clearly

Examples of good responses:
- "Bus line 999 is currently running with minor delays of about 5 minutes. There are 3 active buses on the route."
- "I'm seeing several reports of delays on line 100. Users report 10-15 minute delays due to heavy traffic downtown. Would you like to see alternative routes?"
- "I don't have any recent data for line 999. It may not be currently active, or there might be a service disruption."
"""
