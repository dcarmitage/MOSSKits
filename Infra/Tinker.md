# Tinker.md - Model Fine-Tuning Guide

*The definitive kit for fine-tuning language models with Tinker. Transform your data into specialized AI.*

---

## References

**Official Documentation:**
- [Tinker API Documentation](https://tinker-docs.thinkingmachines.ai/) - Full API reference
- [Tinker Training & Sampling Guide](https://tinker-docs.thinkingmachines.ai/training-sampling) - Core workflows
- [Thinking Machines Tinker](https://thinkingmachines.ai/tinker/) - Main product page

**Code & Examples:**
- [Tinker Cookbook (GitHub)](https://github.com/thinking-machines-lab/tinker-cookbook) - Official recipes and examples
- [Finetune Your Notes (GitHub)](https://github.com/OneInterface/Finetune-your-notes) - Personal notes → trained model
- [Rajan's Tinker Guide](https://www.rajan.sh/tinker) - Practical insights from early adopter

**Background:**
- [Announcing Tinker (Blog)](https://thinkingmachines.ai/blog/announcing-tinker/) - Launch announcement
- [LoRA Without Regret (Technical Note)](https://thinkingmachines.ai/tinker/) - Why LoRA matches full fine-tuning

---

## Overview

### What is Tinker?

Tinker is a training API from [Thinking Machines Lab](https://thinkingmachines.ai/) (Mira Murati's company) that enables fine-tuning of large language models without managing GPU infrastructure.

**The core value proposition:**

> "You write a simple loop that runs on your CPU-only machine. We figure out how to make the training work on a bunch of GPUs."

### Why Tinker for MOSSKits?

| Need | Tinker Solution |
|------|-----------------|
| Custom evaluation models | Fine-tune models to score code quality |
| Domain-specific assistants | Train on specialized documentation |
| Personal AI | Convert your notes into a personalized model |
| Research iteration | Rapid experimentation without infra overhead |
| RLHF pipelines | Full control over reward functions |

### Division of Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           YOU PROVIDE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Training data (text, Q&A pairs, preferences)                             │
│  • Loss functions (cross-entropy, custom rewards)                           │
│  • Training loop (Python script, CPU-only)                                  │
│  • Evaluation criteria                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TINKER HANDLES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Distributed GPU training                                                  │
│  • Model sharding across nodes                                               │
│  • Gradient synchronization                                                  │
│  • Hardware reliability & scaling                                            │
│  • Model serving for inference                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Get API Access

```bash
# 1. Join waitlist at https://thinkingmachines.ai/tinker/
# 2. Get API key from console
# 3. Set environment variable
export TINKER_API_KEY=your-api-key
```

### 2. Install

```bash
pip install tinker
```

### 3. Your First Training Loop

```python
import tinker
from tinker import types

# Initialize clients
service_client = tinker.ServiceClient()
training_client = service_client.create_lora_training_client(
    base_model="meta-llama/Llama-3.2-1B",
    rank=32,  # LoRA rank
)

# Prepare training data
tokenizer = training_client.get_tokenizer()

def create_datum(prompt: str, completion: str) -> types.Datum:
    """Convert a prompt-completion pair into a training datum."""
    prompt_tokens = tokenizer.encode(prompt)
    completion_tokens = tokenizer.encode(completion)

    return types.Datum(
        model_input=types.ModelInput(
            chunks=[types.EncodedTextChunk(tokens=prompt_tokens + completion_tokens)]
        ),
        loss_fn_inputs={
            "weights": [0.0] * len(prompt_tokens) + [1.0] * len(completion_tokens)
        }
    )

# Training data
examples = [
    create_datum("What is Python?", "Python is a programming language."),
    create_datum("Explain recursion.", "Recursion is when a function calls itself."),
]

# Training loop
for epoch in range(10):
    # Compute gradients
    training_client.forward_backward(examples, loss_fn="cross_entropy")

    # Update weights
    training_client.optim_step(types.AdamParams(learning_rate=1e-4))

# Save and sample
sampling_client = training_client.save_weights_and_get_sampling_client(name="my-model")

result = sampling_client.sample(
    prompt="What is machine learning?",
    sampling_params=types.SamplingParams(max_tokens=100, temperature=0.7),
    num_samples=1
)

print(result.completions[0].text)
```

---

## The Tinker Model

### Core Philosophy

Tinker exposes **low-level primitives** rather than high-level abstractions. You control the training loop; Tinker handles the distributed execution.

This means:
- No forced RLHF pipeline
- Custom reward functions in plain Python
- Full control over batching, scheduling, evaluation
- Transparency into what's happening

### The Three Primitives

| Primitive | Purpose | When Called |
|-----------|---------|-------------|
| `forward_backward()` | Compute loss and gradients | Each training step |
| `optim_step()` | Update model weights | After gradient accumulation |
| `sample()` | Generate completions | For evaluation or RL rewards |

All operations have async variants (`forward_backward_async`, etc.) for concurrent execution.

### LoRA-Only Training

Tinker uses **Low-Rank Adaptation (LoRA)** rather than full fine-tuning:

```
Full Fine-Tuning: Update all 70B parameters
LoRA Fine-Tuning: Update ~0.1% of parameters via low-rank adapters
```

**Why LoRA?**
- Faster training (fewer parameters to update)
- Lower memory requirements
- Composable (multiple LoRA adapters on same base)
- Matches full FT quality for most RL workloads

See: [LoRA Without Regret](https://thinkingmachines.ai/tinker/) technical note.

---

## Core API Reference

### ServiceClient

Entry point for all Tinker operations:

```python
import tinker

service_client = tinker.ServiceClient()

# Create training client
training_client = service_client.create_lora_training_client(
    base_model="meta-llama/Llama-3.2-1B",
    rank=32,                    # LoRA rank (8-128 typical)
    learning_rate=1e-4,         # Default LR
    optimizer="adam",           # or "sgd"
)

# Create REST client for weight downloads
rest_client = service_client.create_rest_client()
```

### TrainingClient

Manages training state and operations:

```python
# Get tokenizer for data preparation
tokenizer = training_client.get_tokenizer()

# Compute gradients
future = training_client.forward_backward(
    datums=examples,
    loss_fn="cross_entropy"    # or custom loss function name
)
result = future.result()       # or use forward_backward_async

# Update weights
training_client.optim_step(
    types.AdamParams(
        learning_rate=1e-4,
        beta1=0.9,
        beta2=0.999,
        weight_decay=0.01
    )
)

# Save/load state (for checkpointing)
state = training_client.save_state()
training_client.load_state(state)

# Get sampling client
sampling_client = training_client.save_weights_and_get_sampling_client(
    name="checkpoint-1000"
)
```

### SamplingClient

Generate completions from trained model:

```python
result = sampling_client.sample(
    prompt="Explain quantum computing:",
    sampling_params=types.SamplingParams(
        max_tokens=200,
        temperature=0.8,
        top_p=0.95,
        top_k=50,
        stop_sequences=["\n\n"],
    ),
    num_samples=4,                    # Generate 4 completions
    include_prompt_logprobs=True,     # Include logprobs
    topk_prompt_logprobs=5,           # Top 5 alternatives per token
)

for completion in result.completions:
    print(completion.text)
    print(f"Logprob sum: {sum(completion.logprobs)}")
```

### Data Types

```python
from tinker import types

# Training datum
datum = types.Datum(
    model_input=types.ModelInput(
        chunks=[
            types.EncodedTextChunk(tokens=[1, 2, 3]),
            types.ImageChunk(data=image_bytes, format="png"),  # For VL models
        ]
    ),
    loss_fn_inputs={
        "weights": [0.0, 0.0, 1.0],  # Only train on last token
        "labels": [1, 2, 3],          # For classification
    }
)

# Optimizer params
adam_params = types.AdamParams(
    learning_rate=1e-4,
    beta1=0.9,
    beta2=0.999,
    weight_decay=0.01,
)

# Sampling params
sampling_params = types.SamplingParams(
    max_tokens=100,
    temperature=0.7,
    top_p=0.95,
    stop_sequences=["</s>"],
)
```

---

## Data Preparation

### From Documents to Training Data

The [Finetune Your Notes](https://github.com/OneInterface/Finetune-your-notes) approach:

```
Your Documents (Markdown, Text, PDFs)
              ↓
    Q&A Pair Generation (Gemini/Claude)
              ↓
    JSONL Training Dataset
              ↓
    Tinker Training
              ↓
    Personalized Model
```

### Method 1: AI-Powered Generation (Recommended)

Use Claude or Gemini to create high-quality Q&A pairs:

```python
import anthropic
import json

def generate_qa_pairs(document: str, num_pairs: int = 10) -> list[dict]:
    """Generate Q&A pairs from a document using Claude."""
    client = anthropic.Anthropic()

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": f"""Generate {num_pairs} diverse question-answer pairs from this document.

The questions should:
- Cover different aspects of the content
- Vary in complexity (factual, analytical, inferential)
- Be answerable from the document

Format as JSON array:
[{{"question": "...", "answer": "..."}}]

Document:
{document}"""
        }]
    )

    return json.loads(response.content[0].text)

# Generate and save
with open("notes.md") as f:
    doc = f.read()

pairs = generate_qa_pairs(doc, num_pairs=50)

# Convert to training format
with open("training_data.jsonl", "w") as f:
    for pair in pairs:
        example = {
            "messages": [
                {"role": "user", "content": pair["question"]},
                {"role": "assistant", "content": pair["answer"]}
            ]
        }
        f.write(json.dumps(example) + "\n")
```

### Method 2: Direct Extraction

For structured documents, extract sections directly:

```python
import re

def extract_sections(markdown: str) -> list[dict]:
    """Extract Q&A pairs from markdown headers and content."""
    sections = re.split(r'\n## ', markdown)
    pairs = []

    for section in sections[1:]:  # Skip content before first header
        lines = section.split('\n', 1)
        if len(lines) == 2:
            header, content = lines
            pairs.append({
                "question": f"Explain: {header.strip()}",
                "answer": content.strip()
            })

    return pairs
```

### Training Data Format

Tinker expects `Datum` objects. Helper to convert JSONL:

```python
def load_training_data(jsonl_path: str, tokenizer) -> list[types.Datum]:
    """Load JSONL and convert to Tinker datums."""
    datums = []

    with open(jsonl_path) as f:
        for line in f:
            example = json.loads(line)
            messages = example["messages"]

            # Build prompt (all messages except last assistant)
            prompt = ""
            for msg in messages[:-1]:
                prompt += f"{msg['role']}: {msg['content']}\n"
            prompt += "assistant: "

            # Completion is last assistant message
            completion = messages[-1]["content"]

            # Tokenize
            prompt_tokens = tokenizer.encode(prompt)
            completion_tokens = tokenizer.encode(completion)
            all_tokens = prompt_tokens + completion_tokens

            # Create datum with loss only on completion
            datums.append(types.Datum(
                model_input=types.ModelInput(
                    chunks=[types.EncodedTextChunk(tokens=all_tokens)]
                ),
                loss_fn_inputs={
                    "weights": [0.0] * len(prompt_tokens) + [1.0] * len(completion_tokens)
                }
            ))

    return datums
```

---

## Training Workflows

### Supervised Fine-Tuning (SFT)

The simplest workflow - learn from examples:

```python
import tinker
from tinker import types

def sft_training(
    base_model: str,
    training_data: list[types.Datum],
    epochs: int = 3,
    batch_size: int = 8,
    learning_rate: float = 1e-4,
):
    """Supervised fine-tuning on Q&A pairs."""
    service = tinker.ServiceClient()
    training = service.create_lora_training_client(
        base_model=base_model,
        rank=32,
    )

    total_steps = 0

    for epoch in range(epochs):
        # Shuffle data
        import random
        random.shuffle(training_data)

        # Process in batches
        for i in range(0, len(training_data), batch_size):
            batch = training_data[i:i+batch_size]

            # Forward-backward
            training.forward_backward(batch, loss_fn="cross_entropy")

            # Update
            training.optim_step(types.AdamParams(learning_rate=learning_rate))

            total_steps += 1
            if total_steps % 100 == 0:
                print(f"Step {total_steps}, Epoch {epoch+1}/{epochs}")

        # Save checkpoint after each epoch
        training.save_weights_and_get_sampling_client(name=f"epoch-{epoch+1}")

    return training.save_weights_and_get_sampling_client(name="final")
```

### Reinforcement Learning (RL)

Train with custom reward functions:

```python
async def rl_training(
    base_model: str,
    prompts: list[str],
    reward_fn,  # Your reward function
    iterations: int = 1000,
):
    """RL fine-tuning with custom rewards."""
    service = tinker.ServiceClient()
    training = service.create_lora_training_client(base_model=base_model, rank=32)
    sampling = training.save_weights_and_get_sampling_client(name="rl-init")
    tokenizer = training.get_tokenizer()

    for i in range(iterations):
        # Sample completions
        prompt = random.choice(prompts)
        result = await sampling.sample_async(
            prompt=prompt,
            sampling_params=types.SamplingParams(max_tokens=200, temperature=0.8),
            num_samples=4,
            include_prompt_logprobs=True,
        )

        # Compute rewards
        rewards = [reward_fn(prompt, c.text) for c in result.completions]

        # Create training datums with reward weighting
        datums = []
        for completion, reward in zip(result.completions, rewards):
            tokens = tokenizer.encode(prompt + completion.text)
            prompt_len = len(tokenizer.encode(prompt))

            # Weight by reward (REINFORCE-style)
            weights = [0.0] * prompt_len + [reward] * (len(tokens) - prompt_len)

            datums.append(types.Datum(
                model_input=types.ModelInput(
                    chunks=[types.EncodedTextChunk(tokens=tokens)]
                ),
                loss_fn_inputs={"weights": weights}
            ))

        # Update
        await training.forward_backward_async(datums, loss_fn="cross_entropy")
        await training.optim_step_async(types.AdamParams(learning_rate=1e-5))

        # Periodically update sampling client
        if i % 50 == 0:
            sampling = training.save_weights_and_get_sampling_client(name=f"rl-{i}")
            print(f"Iteration {i}, avg reward: {sum(rewards)/len(rewards):.3f}")

    return training.save_weights_and_get_sampling_client(name="rl-final")
```

### RLHF Pipeline (Three-Stage)

Full Reinforcement Learning from Human Feedback:

```python
async def rlhf_pipeline(
    base_model: str,
    sft_data: list[types.Datum],
    preference_data: list[tuple[str, str, str]],  # (prompt, chosen, rejected)
    prompts: list[str],
):
    """Three-stage RLHF: SFT → Reward Model → RL Policy."""

    # Stage 1: Supervised Fine-Tuning
    print("Stage 1: SFT")
    sft_client = sft_training(base_model, sft_data, epochs=1)

    # Stage 2: Train Reward Model
    print("Stage 2: Reward Model")
    service = tinker.ServiceClient()
    reward_training = service.create_lora_training_client(
        base_model=base_model,
        rank=16,
    )
    tokenizer = reward_training.get_tokenizer()

    for prompt, chosen, rejected in preference_data:
        # Bradley-Terry preference learning
        chosen_tokens = tokenizer.encode(prompt + chosen)
        rejected_tokens = tokenizer.encode(prompt + rejected)

        # Train to prefer chosen over rejected
        reward_training.forward_backward([
            types.Datum(
                model_input=types.ModelInput(
                    chunks=[types.EncodedTextChunk(tokens=chosen_tokens)]
                ),
                loss_fn_inputs={"preference": 1.0}
            ),
            types.Datum(
                model_input=types.ModelInput(
                    chunks=[types.EncodedTextChunk(tokens=rejected_tokens)]
                ),
                loss_fn_inputs={"preference": 0.0}
            ),
        ], loss_fn="bradley_terry")
        reward_training.optim_step(types.AdamParams(learning_rate=1e-5))

    reward_model = reward_training.save_weights_and_get_sampling_client(name="reward")

    # Stage 3: RL with Reward Model
    print("Stage 3: RL Policy")

    async def reward_fn(prompt: str, completion: str) -> float:
        result = await reward_model.sample_async(
            prompt=prompt + completion,
            sampling_params=types.SamplingParams(max_tokens=1),
            include_prompt_logprobs=True,
        )
        # Use final logprob as reward signal
        return sum(result.completions[0].logprobs[-10:])

    final_model = await rl_training(base_model, prompts, reward_fn, iterations=500)

    return final_model
```

---

## Recipes

### Math Reasoning

Train to solve math problems correctly:

```python
def math_reward(prompt: str, completion: str) -> float:
    """Reward correct math answers."""
    # Extract expected answer from prompt
    expected = extract_expected_answer(prompt)

    # Extract model's answer from completion
    model_answer = extract_answer(completion)

    # Binary reward
    if model_answer == expected:
        return 1.0
    else:
        return -0.1  # Small penalty for wrong answers
```

### Code Quality

Train to write better code:

```python
def code_reward(prompt: str, completion: str) -> float:
    """Reward based on code quality metrics."""
    # Try to parse/run the code
    try:
        ast.parse(completion)
        syntax_score = 0.3
    except SyntaxError:
        return -0.5  # Invalid syntax

    # Check for tests passing
    test_score = run_tests(completion) * 0.5

    # Style score
    style_score = check_style(completion) * 0.2

    return syntax_score + test_score + style_score
```

### Prompt Distillation

Internalize complex system prompts:

```python
def distillation_training(
    base_model: str,
    system_prompt: str,
    examples: list[tuple[str, str]],  # (user_input, expected_output)
):
    """Train model to behave as if system prompt is always present."""
    service = tinker.ServiceClient()
    training = service.create_lora_training_client(base_model=base_model, rank=64)
    tokenizer = training.get_tokenizer()

    # Teacher generates with system prompt
    teacher = service.create_sampling_client(base_model=base_model)

    for user_input, _ in examples:
        # Get teacher response (with system prompt)
        teacher_response = teacher.sample(
            prompt=f"{system_prompt}\n\nUser: {user_input}\nAssistant:",
            sampling_params=types.SamplingParams(max_tokens=500, temperature=0.3),
            num_samples=1,
        ).completions[0].text

        # Train student (without system prompt) to match
        student_prompt = f"User: {user_input}\nAssistant:"
        tokens = tokenizer.encode(student_prompt + teacher_response)
        prompt_len = len(tokenizer.encode(student_prompt))

        training.forward_backward([
            types.Datum(
                model_input=types.ModelInput(
                    chunks=[types.EncodedTextChunk(tokens=tokens)]
                ),
                loss_fn_inputs={
                    "weights": [0.0] * prompt_len + [1.0] * (len(tokens) - prompt_len)
                }
            )
        ], loss_fn="cross_entropy")
        training.optim_step(types.AdamParams(learning_rate=1e-4))

    return training.save_weights_and_get_sampling_client(name="distilled")
```

### Multi-Agent Competition

Train models against each other:

```python
async def multi_agent_training(
    base_model: str,
    game_env,  # Your game environment
    iterations: int = 1000,
):
    """Train two models competitively."""
    service = tinker.ServiceClient()

    # Two competing agents
    agent1 = service.create_lora_training_client(base_model=base_model, rank=32)
    agent2 = service.create_lora_training_client(base_model=base_model, rank=32)

    sampler1 = agent1.save_weights_and_get_sampling_client(name="agent1-init")
    sampler2 = agent2.save_weights_and_get_sampling_client(name="agent2-init")

    for i in range(iterations):
        # Play game
        state = game_env.reset()
        trajectory1, trajectory2 = [], []

        while not game_env.done:
            # Agent 1 moves
            move1 = await sampler1.sample_async(
                prompt=game_env.render_for_agent(1),
                sampling_params=types.SamplingParams(max_tokens=10, temperature=0.5),
            )
            trajectory1.append((state, move1))
            state = game_env.step(move1)

            if game_env.done:
                break

            # Agent 2 moves
            move2 = await sampler2.sample_async(
                prompt=game_env.render_for_agent(2),
                sampling_params=types.SamplingParams(max_tokens=10, temperature=0.5),
            )
            trajectory2.append((state, move2))
            state = game_env.step(move2)

        # Determine winner and update
        reward1 = game_env.reward(1)
        reward2 = game_env.reward(2)

        # Update agents based on game outcome
        await update_agent(agent1, trajectory1, reward1)
        await update_agent(agent2, trajectory2, reward2)

        # Refresh samplers periodically
        if i % 50 == 0:
            sampler1 = agent1.save_weights_and_get_sampling_client(name=f"agent1-{i}")
            sampler2 = agent2.save_weights_and_get_sampling_client(name=f"agent2-{i}")
```

---

## Supported Models

### Current Model Support

| Family | Models | Max Size | Notes |
|--------|--------|----------|-------|
| **Llama 3.2** | 1B, 3B | 3B | Fast iteration |
| **Llama 3.1** | 8B, 70B | 70B | Production quality |
| **Qwen 3** | 1.7B, 7B, 32B, 235B | 235B | MoE architecture |
| **Qwen 3-VL** | 7B, 30B | 30B | Vision-language |

### LoRA Configuration

```python
# Recommended LoRA ranks by use case
LORA_RANKS = {
    "quick_test": 8,       # Fastest, smallest
    "standard": 32,        # Good balance
    "high_quality": 64,    # Better quality
    "maximum": 128,        # Highest capacity
}

# Recommended learning rates
LEARNING_RATES = {
    "sft": 1e-4,
    "rl": 1e-5,
    "fine_adjustment": 5e-6,
}
```

---

## Integration with MOSSKits

### Using Cloudflare for Data Pipeline

Combine with [Cloudflare.md](./Cloudflare.md) patterns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Your Documents ──→ Cloudflare R2 ──→ Worker ──→ Claude/Gemini              │
│                       (storage)        (API)     (Q&A generation)            │
│                                          │                                   │
│                                          ▼                                   │
│                                    D1 Database                               │
│                                  (training pairs)                            │
│                                          │                                   │
│                                          ▼                                   │
│                                   Tinker Training                            │
│                                          │                                   │
│                                          ▼                                   │
│                                   Fine-tuned Model                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Evaluation with EvalKit

Use fine-tuned models as evaluators:

```python
# Train a code quality evaluator
quality_model = await rl_training(
    base_model="meta-llama/Llama-3.2-3B",
    prompts=code_quality_prompts,
    reward_fn=human_preference_reward,
    iterations=2000,
)

# Use in EvalKit scoring
async def evaluate_code_quality(code: str) -> float:
    result = await quality_model.sample_async(
        prompt=f"Rate this code's quality (0-100):\n\n{code}\n\nScore:",
        sampling_params=types.SamplingParams(max_tokens=5, temperature=0.1),
    )
    return float(result.completions[0].text.strip())
```

### Training Custom Kit Evaluators

Fine-tune models to score MOSSKit implementations:

```python
# Training data: (kit_implementation, score, reasoning)
evaluation_data = [
    {
        "code": "...",
        "score": 85,
        "reasoning": "Good structure, missing error handling"
    },
    # ... more examples
]

# Train evaluator
evaluator = sft_training(
    base_model="meta-llama/Llama-3.1-8B",
    training_data=prepare_eval_data(evaluation_data),
    epochs=5,
)
```

---

## Best Practices

### Data Quality

1. **Quality over quantity** - 100 high-quality pairs beat 10,000 noisy ones
2. **Diversity** - Cover different question types, styles, complexities
3. **Consistency** - Maintain consistent formatting and style
4. **Validation** - Always test data quality before training

### Hyperparameters

```python
# Recommended starting points
HYPERPARAMS = {
    "sft": {
        "rank": 32,
        "learning_rate": 1e-4,
        "batch_size": 8,
        "epochs": 3,
    },
    "rl": {
        "rank": 32,
        "learning_rate": 1e-5,
        "samples_per_prompt": 4,
        "iterations": 1000,
    },
    "rlhf": {
        "sft_epochs": 1,
        "reward_lr": 1e-5,
        "policy_lr": 1e-6,
    },
}
```

### Iteration Strategy

1. **Start small** - Test with 50 steps and smallest model
2. **Validate quickly** - Check samples every 100 steps
3. **Scale gradually** - Increase model size only when needed
4. **Log everything** - Use Weights & Biases or similar

### Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Overfitting | Early stopping, reduce epochs, increase data |
| Mode collapse (RL) | Lower temperature, KL penalty to base model |
| Training instability | Lower learning rate, gradient clipping |
| Poor generation quality | Check tokenization, increase rank |

---

## Weight Export and Inference

### Download Trained Weights

```python
rest_client = service_client.create_rest_client()

# Get download URL
url = rest_client.get_checkpoint_archive_url_from_tinker_path(
    "tinker://run-12345/sampler_weights/checkpoint"
)

# Download
import requests
response = requests.get(url)
with open("weights.tar.gz", "wb") as f:
    f.write(response.content)
```

### Local Inference

Use downloaded LoRA weights with local inference:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# Load base model
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.2-1B")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.2-1B")

# Load LoRA adapter
model = PeftModel.from_pretrained(base_model, "./extracted_weights/")

# Generate
inputs = tokenizer("Hello, how are you?", return_tensors="pt")
outputs = model.generate(**inputs, max_new_tokens=50)
print(tokenizer.decode(outputs[0]))
```

### Cloud Inference

Use Tinker's inference API:

```python
# Reference saved model
sampling_client = service_client.create_sampling_client_from_path(
    "tinker://run-12345/sampler_weights/final"
)

result = sampling_client.sample(
    prompt="Your prompt here",
    sampling_params=types.SamplingParams(max_tokens=200),
    num_samples=1,
)
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `API_KEY not set` | Missing environment variable | `export TINKER_API_KEY=...` |
| `Unsupported model` | Model not in supported list | Check supported models |
| `Batch too large` | Too many datums | Reduce batch size |
| `Tokenization error` | Invalid tokens | Check tokenizer encoding |

### Debugging Tips

```python
# Enable verbose logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Check tokenization
tokens = tokenizer.encode("test input")
decoded = tokenizer.decode(tokens)
assert decoded == "test input", f"Tokenization mismatch: {decoded}"

# Verify datum structure
for datum in datums[:3]:
    print(f"Tokens: {len(datum.model_input.chunks[0].tokens)}")
    print(f"Weights: {len(datum.loss_fn_inputs['weights'])}")
```

---

## Summary

Tinker provides a powerful, low-level API for fine-tuning language models:

1. **You control the loop** - Custom training logic in Python
2. **They handle the GPUs** - Distributed training is transparent
3. **LoRA-based** - Efficient, composable adapters
4. **Async-first** - Concurrent multi-model training
5. **Export-ready** - Use weights anywhere

For MOSSKits, Tinker enables:
- Training custom evaluation models
- Creating domain-specific assistants
- Building personalized AI from your notes
- Rapid research iteration

---

## Quick Reference

```python
# Initialize
service = tinker.ServiceClient()
training = service.create_lora_training_client(base_model="...", rank=32)
tokenizer = training.get_tokenizer()

# Prepare data
datum = types.Datum(
    model_input=types.ModelInput(chunks=[types.EncodedTextChunk(tokens=...)]),
    loss_fn_inputs={"weights": [...]}
)

# Train
training.forward_backward(datums, loss_fn="cross_entropy")
training.optim_step(types.AdamParams(learning_rate=1e-4))

# Sample
sampling = training.save_weights_and_get_sampling_client(name="model")
result = sampling.sample(prompt="...", sampling_params=types.SamplingParams(...))

# Export
rest = service.create_rest_client()
url = rest.get_checkpoint_archive_url_from_tinker_path("tinker://...")
```

---

*Transform your data into specialized AI. Tinker handles the infrastructure.*
