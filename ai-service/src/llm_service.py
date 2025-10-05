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
        """Initialize LLM service with OpenAI client."""
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url
        )
        self.tool_executor = ToolExecutor(db_service)
        self.model = settings.model_name

    async def chat(
        self,
        messages: List[Dict[str, str]],
        max_iterations: int = 5,
        route_id: Optional[int] = None,
        user_id: Optional[int] = None
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
                    top_p=settings.top_p
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

                        # Inject route_id and user_id if provided and tool is report_bus_delay
                        if function_name == "report_bus_delay":
                            if route_id:
                                function_args["route_id"] = route_id
                            if user_id:
                                function_args["user_id"] = user_id

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

Your role is to help users both CHECK bus status and REPORT delays/issues.

When users ASK about a bus (e.g., "How is bus 999 at station XXX?"):
- Use get_bus_status tool with bus_number and station_id
- bus_number is the specific bus (e.g., "999")
- route is the optional line name (if mentioned)
- Provide delay information from recent reports (last hour)
- Be concise and factual

When users REPORT a delay/issue (e.g., "Bus 999 is delayed at station XXX"):
- Use report_bus_delay tool to record the report
- Extract: bus_number (e.g., "999"), station_id, issue (delayed/cancelled/crowded/broken/dirty)
- Extract delay in minutes if mentioned
- Extract route/line name if mentioned (optional)
- Confirm the report was recorded

Always:
- Be concise and helpful
- Use friendly, conversational language
- If you don't have data, say so clearly
- Do NOT ask follow-up questions unless needed to clarify bus/station
- Information comes from community reports (last hour only)
"""
