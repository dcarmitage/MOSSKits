# Modal Infrastructure Guide

*Everything you need to run GPU workloads, LLM inference, and serverless compute on Modal.*

---

## Why Modal?

| Benefit | Details |
|---------|---------|
| **Serverless GPUs** | Pay per second, no idle costs, instant autoscaling |
| **Python-Native** | Define infrastructure in code, zero YAML |
| **Sub-Second Cold Starts** | Fast container startup with distributed caching |
| **Multi-Cloud** | Pools capacity across providers for best availability |
| **LLM Optimized** | First-class support for vLLM, SGLang, TensorRT-LLM |

**The Sweet Spot**: Modal excels when you need GPUs but don't want to manage infrastructure. If your GPU sits idle >60% of the time, serverless is cheaper than reserved instances.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MODAL STACK                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Functions  │  │   Classes   │  │   Volumes   │  │   Secrets   │         │
│  │ (Serverless)│  │ (Stateful)  │  │ (Persist)   │  │  (Secure)   │         │
│  │             │  │             │  │             │  │             │         │
│  │ • GPU tasks │  │ • LLM serve │  │ • Models    │  │ • API keys  │         │
│  │ • Batch jobs│  │ • Lifecycle │  │ • Data      │  │ • Tokens    │         │
│  │ • Web APIs  │  │ • State     │  │ • Cache     │  │ • Creds     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                          │
│  │    Cron     │  │   Queues    │  │  Sandboxes  │                          │
│  │ (Scheduled) │  │  (Async)    │  │ (Isolated)  │                          │
│  │             │  │             │  │             │                          │
│  │ • Periodic  │  │ • FIFO      │  │ • Code exec │                          │
│  │ • Batch     │  │ • Fan-out   │  │ • Untrusted │                          │
│  └─────────────┘  └─────────────┘  └─────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Installation

```bash
# Install Modal
pip install modal

# Authenticate (opens browser)
modal setup

# Verify installation
modal run --help
```

### Minimal Example

```python
# hello.py
import modal

app = modal.App("hello-modal")

@app.function()
def hello(name: str) -> str:
    return f"Hello, {name}!"

@app.local_entrypoint()
def main():
    result = hello.remote("World")
    print(result)
```

```bash
# Run it
modal run hello.py
```

### GPU Example

```python
import modal

app = modal.App("gpu-example")

@app.function(gpu="A10G")
def gpu_task():
    import torch
    return f"CUDA available: {torch.cuda.is_available()}, Device: {torch.cuda.get_device_name(0)}"

@app.local_entrypoint()
def main():
    print(gpu_task.remote())
```

---

## GPU Options & Pricing

### Available GPUs

| GPU | VRAM | $/second | $/hour | Best For |
|-----|------|----------|--------|----------|
| **T4** | 16GB | $0.000164 | ~$0.59 | Light inference, dev/test |
| **L4** | 24GB | $0.000222 | ~$0.80 | Efficient inference |
| **A10G** | 24GB | $0.000306 | ~$1.10 | Balanced performance |
| **L40S** | 48GB | $0.000542 | ~$1.95 | Large models, good value |
| **A100 40GB** | 40GB | $0.000583 | ~$2.10 | Training, large inference |
| **A100 80GB** | 80GB | $0.000694 | ~$2.50 | Very large models |
| **H100** | 80GB | $0.001097 | ~$3.95 | Maximum performance |

### GPU Selection

```python
# Single GPU
@app.function(gpu="A10G")
def single_gpu_task(): ...

# Specific GPU with count
@app.function(gpu=modal.gpu.A100(count=2))
def multi_gpu_task(): ...

# H100 for maximum performance
@app.function(gpu=modal.gpu.H100(count=8))
def h100_task(): ...

# Any available GPU (for flexibility)
@app.function(gpu="any")
def flexible_task(): ...
```

### Cost Optimization

```python
# Use smaller GPUs for development
@app.function(gpu="T4" if os.getenv("DEV") else "A100")
def adaptive_task(): ...

# Set timeouts to prevent runaway costs
@app.function(gpu="A100", timeout=3600)  # 1 hour max
def bounded_task(): ...
```

---

## Core Concepts

### App

The `App` is the deployment unit:

```python
import modal

# Create an app
app = modal.App("my-app")

# Everything is registered to the app
@app.function()
def my_function(): ...

@app.cls()
class MyService: ...
```

### Functions

Serverless functions that autoscale:

```python
@app.function(
    gpu="A10G",                    # GPU type
    memory=8192,                   # MB of RAM
    cpu=2.0,                       # vCPUs
    timeout=600,                   # seconds
    retries=3,                     # auto-retry on failure
    concurrency_limit=10,          # max concurrent executions
    container_idle_timeout=300,    # keep warm for 5 min
)
def my_function(input: str) -> str:
    return process(input)

# Call remotely
result = my_function.remote("input")

# Call many in parallel (map)
results = list(my_function.map(["a", "b", "c"]))

# Starmap for multiple arguments
results = list(my_function.starmap([("a", 1), ("b", 2)]))
```

### Classes

For stateful services with lifecycle management:

```python
@app.cls(gpu="A100")
class LLMService:
    @modal.enter()
    def load_model(self):
        """Called once when container starts."""
        from vllm import LLM
        self.model = LLM("meta-llama/Llama-3.1-8B-Instruct")

    @modal.method()
    def generate(self, prompt: str) -> str:
        """Called for each request."""
        output = self.model.generate(prompt)
        return output[0].outputs[0].text

    @modal.exit()
    def cleanup(self):
        """Called when container shuts down."""
        del self.model

# Use the class
service = LLMService()
result = service.generate.remote("Hello, ")
```

### Images

Define container environments:

```python
# Start from a base image
image = modal.Image.debian_slim(python_version="3.11")

# Add Python packages
image = image.pip_install(
    "torch",
    "transformers",
    "vllm",
)

# Add system packages
image = image.apt_install("ffmpeg", "libsm6")

# Run commands
image = image.run_commands("echo 'Setup complete'")

# Use the image
@app.function(image=image)
def my_function(): ...
```

### Pre-built Images for LLMs

```python
# vLLM image
vllm_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "vllm==0.6.0",
    "torch",
    "transformers",
)

# SGLang image
sglang_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "sglang[all]",
)

# Use with model download
image_with_model = vllm_image.run_commands(
    "huggingface-cli download meta-llama/Llama-3.1-8B-Instruct"
)
```

---

## LLM Inference Patterns

### Engine Comparison

| Engine | Startup | Performance | Ease of Use | Best For |
|--------|---------|-------------|-------------|----------|
| **vLLM** | ~5 min | Excellent | Easy | General use, fastest features |
| **SGLang** | ~1 min | Excellent | Easy | Fast startup, structured output |
| **TensorRT-LLM** | Variable | Best (tuned) | Hard | Maximum performance, production |

**Recommendation**: Start with vLLM or SGLang. Only consider TensorRT-LLM if you've exhausted other optimizations and have engineering capacity.

### vLLM Pattern

```python
import modal

app = modal.App("vllm-inference")

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("vllm", "torch", "transformers")
)

MODEL_ID = "meta-llama/Llama-3.1-8B-Instruct"

@app.cls(
    gpu=modal.gpu.A100(count=1),
    image=vllm_image,
    container_idle_timeout=300,
)
class VLLMService:
    @modal.enter()
    def load(self):
        from vllm import LLM, SamplingParams
        self.llm = LLM(
            model=MODEL_ID,
            tensor_parallel_size=1,
            max_model_len=4096,
        )
        self.sampling_params = SamplingParams(
            temperature=0.7,
            max_tokens=512,
        )

    @modal.method()
    def generate(self, prompt: str) -> str:
        outputs = self.llm.generate([prompt], self.sampling_params)
        return outputs[0].outputs[0].text

    @modal.method()
    def generate_batch(self, prompts: list[str]) -> list[str]:
        outputs = self.llm.generate(prompts, self.sampling_params)
        return [o.outputs[0].text for o in outputs]
```

### SGLang Pattern

```python
import modal

app = modal.App("sglang-inference")

sglang_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("sglang[all]", "torch")
)

@app.cls(
    gpu=modal.gpu.A100(count=1),
    image=sglang_image,
)
class SGLangService:
    @modal.enter()
    def load(self):
        import sglang as sgl
        self.runtime = sgl.Runtime(
            model_path="meta-llama/Llama-3.1-8B-Instruct",
            tp_size=1,
        )
        sgl.set_default_backend(self.runtime)

    @modal.method()
    def generate(self, prompt: str) -> str:
        import sglang as sgl

        @sgl.function
        def simple_gen(s, prompt):
            s += prompt
            s += sgl.gen("response", max_tokens=512)

        state = simple_gen.run(prompt=prompt)
        return state["response"]

    @modal.exit()
    def cleanup(self):
        self.runtime.shutdown()
```

### Multi-GPU Inference (Large Models)

```python
@app.cls(
    gpu=modal.gpu.H100(count=8),  # 8x H100 for 70B+ models
    image=vllm_image,
)
class LargeModelService:
    @modal.enter()
    def load(self):
        from vllm import LLM
        self.llm = LLM(
            model="meta-llama/Llama-3.1-70B-Instruct",
            tensor_parallel_size=8,  # Shard across all GPUs
            max_model_len=8192,
        )

    @modal.method()
    def generate(self, prompt: str) -> str:
        outputs = self.llm.generate([prompt])
        return outputs[0].outputs[0].text
```

### Batch Processing Pattern

For non-interactive workloads (data extraction, translation, summarization):

```python
@app.function(
    gpu=modal.gpu.A100(count=8),
    image=vllm_image,
    timeout=3600,
)
def batch_process(prompts: list[str]) -> list[str]:
    from vllm import LLM, SamplingParams

    llm = LLM(
        model="meta-llama/Llama-3.1-70B-Instruct",
        tensor_parallel_size=8,
    )

    # Process all at once for maximum throughput
    params = SamplingParams(temperature=0.0, max_tokens=1024)
    outputs = llm.generate(prompts, params)

    return [o.outputs[0].text for o in outputs]

# Usage: ~50¢ per million tokens at scale
results = batch_process.remote(thousands_of_prompts)
```

---

## Web Endpoints

### FastAPI Integration

```python
from fastapi import FastAPI
import modal

app = modal.App("web-api")
web_app = FastAPI()

@web_app.get("/health")
def health():
    return {"status": "ok"}

@web_app.post("/generate")
def generate(prompt: str):
    # Call a Modal function
    result = inference_function.remote(prompt)
    return {"result": result}

@app.function()
@modal.asgi_app()
def api():
    return web_app
```

### Streaming Responses

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import modal

app = modal.App("streaming-api")
web_app = FastAPI()

@app.cls(gpu="A100")
class StreamingLLM:
    @modal.enter()
    def load(self):
        from vllm import LLM
        self.llm = LLM("meta-llama/Llama-3.1-8B-Instruct")

    @modal.method()
    def stream_generate(self, prompt: str):
        from vllm import SamplingParams
        params = SamplingParams(temperature=0.7, max_tokens=512)

        for output in self.llm.generate([prompt], params, use_tqdm=False):
            for token in output.outputs[0].text:
                yield token

@web_app.post("/stream")
async def stream(prompt: str):
    llm = StreamingLLM()

    async def generate():
        async for token in llm.stream_generate.remote_gen(prompt):
            yield token

    return StreamingResponse(generate(), media_type="text/plain")

@app.function()
@modal.asgi_app()
def api():
    return web_app
```

### Web Endpoint with Custom Domain

```python
@app.function()
@modal.asgi_app(label="my-api")  # Creates stable URL
def api():
    return web_app

# Deployed at: https://my-org--my-api.modal.run
```

---

## Data & Storage

### Volumes (Persistent Storage)

```python
import modal

app = modal.App("with-volume")

# Create a persistent volume
volume = modal.Volume.from_name("my-data", create_if_missing=True)

@app.function(volumes={"/data": volume})
def save_data(content: str):
    with open("/data/file.txt", "w") as f:
        f.write(content)
    volume.commit()  # Persist changes

@app.function(volumes={"/data": volume})
def read_data() -> str:
    with open("/data/file.txt") as f:
        return f.read()
```

### Model Caching with Volumes

```python
model_volume = modal.Volume.from_name("model-cache", create_if_missing=True)

@app.cls(
    gpu="A100",
    volumes={"/models": model_volume},
)
class CachedModelService:
    @modal.enter()
    def load(self):
        import os
        model_path = "/models/llama-3.1-8b"

        if not os.path.exists(model_path):
            # Download and cache
            from huggingface_hub import snapshot_download
            snapshot_download(
                "meta-llama/Llama-3.1-8B-Instruct",
                local_dir=model_path,
            )
            model_volume.commit()

        from vllm import LLM
        self.llm = LLM(model_path)
```

### Cloud Bucket Mounts

```python
# Mount S3 bucket
s3_mount = modal.CloudBucketMount(
    bucket_name="my-bucket",
    secret=modal.Secret.from_name("aws-secret"),
)

@app.function(volumes={"/s3": s3_mount})
def process_s3_data():
    # Read from S3 as if it's a local filesystem
    with open("/s3/data/file.json") as f:
        return json.load(f)
```

### Dicts (Key-Value Store)

```python
# Create a distributed dict
cache = modal.Dict.from_name("my-cache", create_if_missing=True)

@app.function()
def cached_computation(key: str) -> str:
    # Check cache
    if key in cache:
        return cache[key]

    # Compute and cache
    result = expensive_computation(key)
    cache[key] = result
    return result
```

### Queues

```python
queue = modal.Queue.from_name("job-queue", create_if_missing=True)

@app.function()
def producer():
    for i in range(100):
        queue.put({"task_id": i, "data": f"item_{i}"})

@app.function()
def consumer():
    while True:
        try:
            item = queue.get(timeout=30)
            process(item)
        except modal.exception.TimeoutError:
            break  # Queue empty
```

---

## Secrets Management

### Creating Secrets

```bash
# Via CLI
modal secret create my-api-key API_KEY=sk-xxx

# Or in the Modal dashboard
```

### Using Secrets

```python
@app.function(secrets=[modal.Secret.from_name("my-api-key")])
def use_secret():
    import os
    api_key = os.environ["API_KEY"]
    return call_api(api_key)

# Multiple secrets
@app.function(secrets=[
    modal.Secret.from_name("openai-secret"),
    modal.Secret.from_name("anthropic-secret"),
])
def multi_provider():
    import os
    openai_key = os.environ["OPENAI_API_KEY"]
    anthropic_key = os.environ["ANTHROPIC_API_KEY"]
```

### Environment-Based Secrets

```python
# Different secrets for dev/prod
import os

secret_name = "prod-secrets" if os.getenv("MODAL_ENVIRONMENT") == "main" else "dev-secrets"

@app.function(secrets=[modal.Secret.from_name(secret_name)])
def env_aware_function():
    ...
```

---

## Scheduling (Cron)

### Basic Scheduling

```python
@app.function(schedule=modal.Cron("0 6 * * *"))  # Daily at 6 AM UTC
def daily_job():
    print("Running daily job")

@app.function(schedule=modal.Period(hours=4))  # Every 4 hours
def periodic_job():
    print("Running periodic job")
```

### Scheduled Data Pipeline

```python
@app.function(
    schedule=modal.Cron("0 */6 * * *"),  # Every 6 hours
    secrets=[modal.Secret.from_name("api-keys")],
    timeout=3600,
)
def sync_data():
    # Fetch from external API
    data = fetch_external_data()

    # Process with GPU
    results = process_with_gpu.remote(data)

    # Store results
    save_results.remote(results)
```

---

## Benchmarking LLMs

### Key Metrics

| Metric | What It Measures | Why It Matters |
|--------|------------------|----------------|
| **TTFT** | Time to First Token | User-perceived latency for streaming |
| **TTLT** | Time to Last Token | Total generation time |
| **ITL** | Inter-Token Latency | Token generation speed |
| **Throughput** | Requests/second | Capacity planning |

### Estimation Rule (Three Nineties)

```
P90 TTLT ≈ P90 TTFT + (P90 ITL × output_tokens)
```

### Benchmarking Setup

```python
import modal
import time
from dataclasses import dataclass

app = modal.App("llm-benchmark")

@dataclass
class BenchmarkResult:
    ttft: float
    ttlt: float
    tokens_generated: int
    throughput: float

@app.cls(gpu=modal.gpu.H100(count=1))
class Benchmark:
    @modal.enter()
    def load(self):
        from vllm import LLM
        self.llm = LLM("meta-llama/Llama-3.1-8B-Instruct")

    @modal.method()
    def run_single(self, prompt: str, max_tokens: int = 512) -> BenchmarkResult:
        from vllm import SamplingParams

        start = time.perf_counter()

        params = SamplingParams(max_tokens=max_tokens)
        outputs = self.llm.generate([prompt], params)

        end = time.perf_counter()

        output = outputs[0].outputs[0]
        tokens = len(output.token_ids)

        return BenchmarkResult(
            ttft=0,  # Would need streaming to measure
            ttlt=end - start,
            tokens_generated=tokens,
            throughput=tokens / (end - start),
        )

    @modal.method()
    def run_throughput(self, prompts: list[str], max_tokens: int = 512) -> float:
        """Measure maximum throughput with batching."""
        from vllm import SamplingParams

        start = time.perf_counter()

        params = SamplingParams(max_tokens=max_tokens)
        outputs = self.llm.generate(prompts, params)

        end = time.perf_counter()

        total_tokens = sum(len(o.outputs[0].token_ids) for o in outputs)
        return total_tokens / (end - start)

@app.local_entrypoint()
def main():
    bench = Benchmark()

    # Single request latency
    result = bench.run_single.remote("Explain quantum computing in simple terms.")
    print(f"Single request: {result.ttlt:.2f}s, {result.throughput:.1f} tok/s")

    # Throughput test
    prompts = ["Explain " + topic for topic in ["AI", "ML", "NLP", "CV"] * 25]
    throughput = bench.run_throughput.remote(prompts)
    print(f"Batch throughput: {throughput:.1f} tok/s")
```

### Performance Baselines

From Modal's benchmarks with H100 clusters:

| Model | Setup | Throughput | Cost |
|-------|-------|------------|------|
| Llama 3.1 70B (8-bit) | 8x H100 | ~20k tok/s | ~$0.50/M tokens |
| Llama 3.1 8B | 1x A100 | ~3k tok/s | ~$0.30/M tokens |

---

## Deployment Patterns

### Development Workflow

```bash
# Run interactively (for development)
modal run my_app.py

# Deploy (for production)
modal deploy my_app.py

# Deploy with environment
modal deploy my_app.py --env=prod
```

### Blue-Green Deployments

```python
# Deploy new version
modal deploy my_app.py --tag=v2

# Test new version
curl https://my-org--my-app-v2.modal.run/health

# Promote to production (update default)
modal deploy my_app.py  # Becomes the default
```

### CI/CD with GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Modal
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Modal
        run: pip install modal

      - name: Deploy
        run: modal deploy app.py
        env:
          MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
          MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}
```

### Multi-Environment Setup

```python
import modal
import os

# Environment-aware configuration
ENV = os.getenv("MODAL_ENVIRONMENT", "dev")

app = modal.App(f"my-app-{ENV}")

# Different GPU for dev vs prod
GPU = "T4" if ENV == "dev" else "A100"

@app.function(gpu=GPU)
def my_function():
    ...
```

---

## Best Practices

### 1. Optimize Container Startup

```python
# BAD: Download model on every cold start
@app.function(gpu="A100")
def slow_start():
    model = download_model()  # Takes minutes!
    return model.generate(...)

# GOOD: Use volume caching
model_volume = modal.Volume.from_name("models")

@app.cls(gpu="A100", volumes={"/models": model_volume})
class FastStart:
    @modal.enter()
    def load(self):
        # Model persisted in volume, loads in seconds
        self.model = load_model("/models/llama")
```

### 2. Keep Containers Warm

```python
@app.function(
    gpu="A100",
    container_idle_timeout=600,  # Keep warm for 10 min
    allow_concurrent_inputs=10,  # Handle multiple requests per container
)
def warm_function():
    ...
```

### 3. Use Batching for Throughput

```python
# BAD: Process one at a time
for item in items:
    result = process.remote(item)  # N cold starts possible

# GOOD: Process in batches
results = list(process.map(items))  # Parallelized efficiently

# BETTER: Use @modal.batched for dynamic batching
@app.function(gpu="A100")
@modal.batched(max_batch_size=32, wait_ms=100)
def batched_process(items: list[str]) -> list[str]:
    return model.batch_inference(items)
```

### 4. Handle Errors Gracefully

```python
@app.function(
    retries=modal.Retries(
        max_retries=3,
        backoff_coefficient=2.0,
        initial_delay=1.0,
    ),
    timeout=300,
)
def reliable_function():
    try:
        return risky_operation()
    except TransientError:
        raise  # Will be retried
    except PermanentError as e:
        # Log and return error, don't retry
        return {"error": str(e)}
```

### 5. Monitor Costs

```python
# Set resource limits
@app.function(
    gpu="A100",
    timeout=600,           # Max 10 minutes
    memory=32768,          # 32GB RAM max
)
def bounded_function():
    ...

# Use cheaper GPUs for dev
import os
GPU = "T4" if os.getenv("DEV") else "A100"
```

---

## Common Patterns

### Fan-Out/Fan-In

```python
@app.function()
def process_chunk(chunk: list) -> list:
    return [transform(item) for item in chunk]

@app.function()
def aggregate(results: list[list]) -> dict:
    all_items = [item for sublist in results for item in sublist]
    return {"total": len(all_items), "items": all_items}

@app.local_entrypoint()
def main():
    data = load_large_dataset()
    chunks = [data[i:i+100] for i in range(0, len(data), 100)]

    # Fan-out: Process chunks in parallel
    results = list(process_chunk.map(chunks))

    # Fan-in: Aggregate results
    final = aggregate.remote(results)
    print(final)
```

### Pipeline Pattern

```python
@app.function()
def extract(url: str) -> dict:
    return fetch_and_parse(url)

@app.function(gpu="A100")
def transform(data: dict) -> dict:
    return llm_process(data)

@app.function()
def load(data: dict) -> str:
    return save_to_database(data)

@app.function()
def pipeline(url: str) -> str:
    extracted = extract.remote(url)
    transformed = transform.remote(extracted)
    return load.remote(transformed)
```

### Embedding Service

```python
@app.cls(gpu="A10G")
class EmbeddingService:
    @modal.enter()
    def load(self):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    @modal.method()
    def embed(self, texts: list[str]) -> list[list[float]]:
        embeddings = self.model.encode(texts)
        return embeddings.tolist()

    @modal.method()
    @modal.batched(max_batch_size=64, wait_ms=50)
    def embed_batched(self, texts: list[str]) -> list[list[float]]:
        """Auto-batches incoming requests for efficiency."""
        return self.embed(texts)
```

### Code Sandbox

```python
@app.function()
def run_untrusted_code(code: str, timeout: int = 30) -> dict:
    """Safely execute untrusted code in an isolated sandbox."""
    sandbox = modal.Sandbox.create(
        app=app,
        timeout=timeout,
        cpu=1.0,
        memory=1024,
    )

    try:
        process = sandbox.exec("python", "-c", code)
        stdout = process.stdout.read()
        stderr = process.stderr.read()
        return {
            "success": process.returncode == 0,
            "stdout": stdout,
            "stderr": stderr,
        }
    finally:
        sandbox.terminate()
```

---

## Integration with Cloudflare

For MOSSKits projects, Modal and Cloudflare complement each other:

| Task | Best Platform |
|------|---------------|
| API endpoints, frontend | Cloudflare Workers/Pages |
| LLM inference | Modal |
| GPU compute | Modal |
| Database (SQL) | Cloudflare D1 |
| File storage | Cloudflare R2 or Modal Volumes |
| Async queues | Either (Cloudflare Queues or Modal Queues) |

### Cloudflare Worker Calling Modal

```typescript
// Cloudflare Worker
app.post('/generate', async (c) => {
  const { prompt } = await c.req.json();

  // Call Modal endpoint
  const response = await fetch('https://your-org--llm-service.modal.run/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  const result = await response.json();
  return c.json(result);
});
```

### Modal Calling Cloudflare D1

```python
@app.function(secrets=[modal.Secret.from_name("cloudflare")])
def sync_to_cloudflare(results: list[dict]):
    import os
    import requests

    cf_api = os.environ["CF_API_TOKEN"]
    account_id = os.environ["CF_ACCOUNT_ID"]
    database_id = os.environ["CF_DATABASE_ID"]

    # Use Cloudflare D1 HTTP API
    for result in results:
        requests.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query",
            headers={"Authorization": f"Bearer {cf_api}"},
            json={"sql": "INSERT INTO results (id, data) VALUES (?, ?)", "params": [result["id"], result["data"]]},
        )
```

---

## Project Structure

```
my-modal-project/
├── app.py                  # Main Modal app
├── models/
│   ├── llm.py              # LLM service classes
│   ├── embeddings.py       # Embedding service
│   └── vision.py           # Vision models
├── pipelines/
│   ├── batch.py            # Batch processing
│   └── streaming.py        # Streaming inference
├── api/
│   └── web.py              # FastAPI endpoints
├── jobs/
│   └── scheduled.py        # Cron jobs
├── tests/
│   └── test_models.py      # Tests
├── requirements.txt
└── README.md
```

---

## Summary

Modal is ideal for GPU workloads in MOSSKits:

1. **LLM Inference** - vLLM/SGLang with automatic scaling
2. **Batch Processing** - Cost-effective parallel computation
3. **Model Serving** - Low-latency endpoints with warm containers
4. **Benchmarking** - Easy performance testing across configurations

Key patterns:
- Use Volumes for model caching (avoid cold start downloads)
- Keep containers warm with `container_idle_timeout`
- Use `@modal.batched` for throughput optimization
- Complement Cloudflare for frontend/API, use Modal for GPU

---

## Sources

- [Modal Pricing](https://modal.com/pricing)
- [Modal LLM Almanac Summary](https://modal.com/llm-almanac/summary)
- [Modal LLM Benchmarking Guide](https://modal.com/llm-almanac/how-to-benchmark)
- [Modal Documentation Reference](https://modal.com/docs/reference)
- [Modal H100 Pricing](https://modal.com/blog/nvidia-h100-price-article)

---

*Run GPUs when you need them. Pay only for what you use. Ship faster.*
