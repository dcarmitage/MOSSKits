# Claude Agent SDK Guide

*Build autonomous AI agents with Claude Code as a library.*

---

## What Is It?

The Claude Agent SDK gives you programmatic access to everything that powers Claude Code: file operations, terminal commands, web search, code editing—all with Claude handling the tool execution loop.

```python
from claude_agent_sdk import query, ClaudeAgentOptions

async for message in query(
    prompt="Find and fix the bug in auth.py",
    options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"])
):
    print(message)  # Claude reads, finds bug, edits—autonomously
```

**Key difference from Anthropic Client SDK**: You don't implement tool execution. Claude handles it.

---

## Quick Start

```bash
# 1. Install Claude Code runtime
curl -fsSL https://claude.ai/install.sh | bash

# 2. Install SDK
pip install claude-agent-sdk  # Python
npm install @anthropic-ai/claude-agent-sdk  # TypeScript

# 3. Set API key
export ANTHROPIC_API_KEY=your-key
```

---

## Built-in Tools

| Tool | Purpose |
|------|---------|
| `Read` | Read any file |
| `Write` | Create new files |
| `Edit` | Precise edits to existing files |
| `Bash` | Run terminal commands |
| `Glob` | Find files by pattern (`**/*.ts`) |
| `Grep` | Search file contents with regex |
| `WebSearch` | Search the web |
| `WebFetch` | Fetch and parse web pages |
| `Task` | Spawn subagents for complex tasks |

---

## Core Patterns

### Simple Query

```python
import anyio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="What files are in this directory?",
        options=ClaudeAgentOptions(allowed_tools=["Glob", "Read"])
    ):
        print(message)

anyio.run(main)
```

### Interactive Client

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

options = ClaudeAgentOptions(
    system_prompt="You are a code reviewer",
    allowed_tools=["Read", "Glob", "Grep"],
    cwd="/path/to/project"
)

async with ClaudeSDKClient(options=options) as client:
    await client.query("Review the authentication module")
    async for msg in client.receive_response():
        print(msg)
```

### Session Persistence

```python
from claude_agent_sdk import query, ClaudeAgentOptions

session_id = None

# First query: capture session
async for message in query(
    prompt="Read the auth module",
    options=ClaudeAgentOptions(allowed_tools=["Read", "Glob"])
):
    if hasattr(message, 'subtype') and message.subtype == 'init':
        session_id = message.data.get('session_id')

# Resume with full context
async for message in query(
    prompt="Now find all places that call it",
    options=ClaudeAgentOptions(resume=session_id)
):
    print(message)
```

---

## Configuration

```python
ClaudeAgentOptions(
    # Core
    system_prompt="string",              # Custom instructions
    allowed_tools=["Read", "Write"],     # Whitelist tools
    max_turns=10,                        # Limit conversation turns
    cwd="/path/to/project",              # Working directory

    # Permissions
    permission_mode="acceptEdits",       # Auto-accept file changes
    # Options: "default", "acceptEdits", "bypassPermissions"

    # Advanced
    mcp_servers={...},                   # MCP server configs
    hooks={...},                         # Lifecycle hooks
    cli_path="/custom/path/to/claude",   # Custom CLI path

    # Session
    resume="session-id",                 # Resume previous session
)
```

---

## Custom Tools (In-Process MCP)

Define tools as Python functions—no subprocess management:

```python
from claude_agent_sdk import (
    tool,
    create_sdk_mcp_server,
    ClaudeAgentOptions,
    ClaudeSDKClient
)

@tool("calculate", "Perform calculation", {"expression": str})
async def calculate(args):
    result = eval(args["expression"])  # In production, use safe eval
    return {"content": [{"type": "text", "text": str(result)}]}

@tool("fetch_data", "Fetch from API", {"url": str})
async def fetch_data(args):
    # Your API logic here
    return {"content": [{"type": "text", "text": "data"}]}

# Create server
server = create_sdk_mcp_server(
    name="my-tools",
    version="1.0.0",
    tools=[calculate, fetch_data]
)

# Use with Claude
options = ClaudeAgentOptions(
    mcp_servers={"tools": server},
    allowed_tools=["mcp__tools__calculate", "mcp__tools__fetch_data"]
)

async with ClaudeSDKClient(options=options) as client:
    await client.query("Calculate 2 + 2 * 3")
    async for msg in client.receive_response():
        print(msg)
```

---

## Hooks

Inject custom logic at key points in the agent loop:

```python
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, HookMatcher

async def validate_bash(input_data, tool_use_id, context):
    """Block dangerous commands."""
    if input_data["tool_name"] != "Bash":
        return {}

    command = input_data["tool_input"].get("command", "")
    dangerous = ["rm -rf", "sudo", "chmod 777"]

    for pattern in dangerous:
        if pattern in command:
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": f"Blocked: {pattern}",
                }
            }
    return {}

options = ClaudeAgentOptions(
    allowed_tools=["Bash", "Read"],
    hooks={
        "PreToolUse": [
            HookMatcher(matcher="Bash", hooks=[validate_bash]),
        ],
    }
)
```

**Available hooks**: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`

---

## MCP Servers

Connect external tools via Model Context Protocol:

```python
# External server (subprocess)
options = ClaudeAgentOptions(
    mcp_servers={
        "playwright": {
            "command": "npx",
            "args": ["@playwright/mcp@latest"]
        }
    }
)

# Mixed: in-process + external
options = ClaudeAgentOptions(
    mcp_servers={
        "internal": my_sdk_server,      # In-process
        "browser": {                    # External
            "command": "npx",
            "args": ["@playwright/mcp@latest"]
        }
    }
)
```

---

## Subagents

Let Claude spawn focused agents for complex tasks:

```python
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Glob", "Grep", "Task"]  # Task enables subagents
)

async for message in query(
    prompt="Analyze this codebase for security vulnerabilities",
    options=options
):
    print(message)  # Claude may spawn subagents for different file types
```

---

## Error Handling

```python
from claude_agent_sdk import (
    ClaudeSDKError,        # Base
    CLINotFoundError,      # Claude Code not installed
    CLIConnectionError,    # Connection failed
    ProcessError,          # Process crashed
    CLIJSONDecodeError,    # Parse error
)

try:
    async for message in query(prompt="Hello"):
        pass
except CLINotFoundError:
    print("Install Claude Code: curl -fsSL https://claude.ai/install.sh | bash")
except ProcessError as e:
    print(f"Process failed: exit code {e.exit_code}")
```

---

## Message Types

```python
from claude_agent_sdk import (
    AssistantMessage,   # Claude's response
    UserMessage,        # Your input
    SystemMessage,      # System events
    ResultMessage,      # Tool results
    TextBlock,          # Text content
    ToolUseBlock,       # Tool invocation
    ToolResultBlock,    # Tool output
)

async for message in query(prompt="Hello"):
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, TextBlock):
                print(block.text)
            elif isinstance(block, ToolUseBlock):
                print(f"Using tool: {block.name}")
```

---

## TypeScript

```typescript
import { query, ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";

// Simple query
for await (const message of query({
  prompt: "Find all TODO comments",
  options: { allowedTools: ["Grep", "Glob"] }
})) {
  console.log(message);
}

// With full options
const options: ClaudeAgentOptions = {
  systemPrompt: "You are a code reviewer",
  allowedTools: ["Read", "Glob", "Grep"],
  permissionMode: "bypassPermissions",
  maxTurns: 20,
};

for await (const message of query({ prompt: "Review auth.ts", options })) {
  if (message.type === "assistant") {
    console.log(message.content);
  }
}
```

---

## Integration Patterns

### CI/CD Pipeline

```python
async def run_code_review(pr_files: list[str]) -> str:
    """Run Claude as automated code reviewer."""
    results = []

    options = ClaudeAgentOptions(
        system_prompt="Review code for bugs, security issues, and best practices",
        allowed_tools=["Read", "Glob", "Grep"],
        permission_mode="bypassPermissions",
        max_turns=50,
    )

    async for message in query(
        prompt=f"Review these files for issues: {', '.join(pr_files)}",
        options=options
    ):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    results.append(block.text)

    return "\n".join(results)
```

### Background Worker

```python
async def process_task(task_id: str, instruction: str):
    """Run agent as background job."""
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permission_mode="acceptEdits",
        cwd=f"/tasks/{task_id}",
    )

    async for message in query(prompt=instruction, options=options):
        # Log progress
        await update_task_status(task_id, message)

    await mark_task_complete(task_id)
```

### Research Agent

```python
async def research(question: str) -> str:
    """Web research agent."""
    options = ClaudeAgentOptions(
        system_prompt="You are a research assistant. Search thoroughly and cite sources.",
        allowed_tools=["WebSearch", "WebFetch"],
        max_turns=30,
    )

    findings = []
    async for message in query(prompt=question, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    findings.append(block.text)

    return findings[-1] if findings else "No findings"
```

---

## Best Practices

### 1. Scope Tools Appropriately

```python
# Read-only agent (safe)
ClaudeAgentOptions(allowed_tools=["Read", "Glob", "Grep"])

# Code modification agent
ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Edit"],
    permission_mode="acceptEdits"
)

# Full access (use carefully)
ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Edit", "Bash"],
    permission_mode="bypassPermissions"
)
```

### 2. Use Hooks for Safety

```python
# Always validate Bash commands in production
hooks = {
    "PreToolUse": [
        HookMatcher(matcher="Bash", hooks=[validate_command]),
    ],
}
```

### 3. Set Working Directory

```python
# Scope agent to specific project
ClaudeAgentOptions(cwd="/path/to/project")
```

### 4. Limit Turns for Bounded Execution

```python
# Prevent runaway agents
ClaudeAgentOptions(max_turns=20)
```

### 5. Use Sessions for Context

```python
# Resume previous work instead of starting fresh
ClaudeAgentOptions(resume=session_id)
```

---

## When to Use

| Use Case | Agent SDK | Client SDK |
|----------|-----------|------------|
| Code review automation | Yes | No |
| Bug fixing pipelines | Yes | No |
| Codebase analysis | Yes | No |
| Research agents | Yes | Maybe |
| Chatbots | No | Yes |
| Simple Q&A | No | Yes |
| Custom tool loops | No | Yes |

**Rule of thumb**: If the task involves files, code, or commands → Agent SDK. If it's pure conversation → Client SDK.

---

## Resources

- [Official Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Python SDK](https://github.com/anthropics/claude-agent-sdk-python)
- [TypeScript SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Example Agents](https://github.com/anthropics/claude-agent-sdk-demos)

---

*Autonomous agents. Built-in tools. Production ready.*
