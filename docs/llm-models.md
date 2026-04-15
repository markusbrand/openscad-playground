# LLM Model Recommendations for OpenSCAD Code Generation

*Research compiled by C-3PO.*

This document summarizes practical choices for large language models when generating, reviewing, or debugging OpenSCAD code—whether in the cloud or locally.

## Cloud LLM Providers

### Google Gemini (Recommended Primary)

- **Gemini 2.5 Pro**: Best overall for code generation + vision (can analyze photos of 3D models). Pricing: Pay-per-token via Google AI Studio or Vertex AI. Free tier available with rate limits.
- **Gemini 2.5 Flash**: Faster, cheaper, good for iterative debugging. Free tier generous.
- **License**: Google AI Terms of Service. API key from [ai.google.dev](https://ai.google.dev)
- **Why recommended**: Excellent code generation, vision capabilities for photo-to-3D, generous free tier, fast

### OpenAI

- **GPT-4o**: Strong code generation, vision support. Pricing: ~$2.50/$10 per 1M input/output tokens
- **GPT-4o-mini**: Budget option, still good for code. ~$0.15/$0.60 per 1M tokens
- **o3-mini**: Reasoning model, good for complex parametric designs. Higher cost.
- **License**: OpenAI Terms of Use. API key from [platform.openai.com](https://platform.openai.com)

### Anthropic Claude

- **Claude 4 Sonnet**: Excellent at following complex instructions, very good at code. ~$3/$15 per 1M tokens
- **Claude 3.5 Haiku**: Fast and cheap for iterative work. ~$0.25/$1.25 per 1M tokens
- **License**: Anthropic Terms of Service. API key from [console.anthropic.com](https://console.anthropic.com)
- **Strength**: Best at following detailed system prompts precisely

### Mistral AI

- **Mistral Large**: Competitive code generation. ~$2/$6 per 1M tokens
- **Codestral**: Specialized for code tasks. ~$0.30/$0.90 per 1M tokens
- **License**: Mistral API TOS. Some base models are Apache 2.0 (open weights)
- **API key**: From [console.mistral.ai](https://console.mistral.ai)

## Local Models (Ollama)

For running on Raspberry Pi or local server. No API costs, full privacy. Requires Ollama installed.

### Recommended Local Models (by RAM requirement)

| Model | RAM Needed | Quality for OpenSCAD | Notes |
|-------|-----------|---------------------|-------|
| `qwen2.5-coder:7b` | 8GB | Good | Best quality/size ratio for code |
| `deepseek-coder-v2:16b` | 16GB | Very Good | Strong code generation |
| `codellama:13b` | 16GB | Good | Meta's code model, solid |
| `qwen2.5-coder:32b` | 32GB+ | Excellent | Near cloud quality if you have RAM |
| `mistral:7b` | 8GB | Decent | General purpose, lighter |
| `gemma2:9b` | 12GB | Good | Google's open model |
| `phi-3:14b` | 16GB | Good | Microsoft's efficient model |

### Raspberry Pi Considerations

- Pi 5 with 8GB RAM: Use `qwen2.5-coder:7b` or `mistral:7b` (quantized Q4_K_M)
- Pi 5 with 16GB: Can run `deepseek-coder-v2:16b` (Q4 quantization)
- External GPU or x86 server recommended for 32b+ models
- Ollama endpoint: typically `http://localhost:11434`
- Note: Local inference is MUCH slower than cloud APIs, especially on Pi

## Setup Instructions

### Cloud Providers

1. Obtain API key from the provider's console
2. Enter in the application Settings dialog
3. Select the model from the dropdown
4. Keys are stored encrypted on the server

### Ollama (Local)

1. Install Ollama: [https://ollama.ai](https://ollama.ai)
2. Pull a model: `ollama pull qwen2.5-coder:7b`
3. Ensure Ollama is running: `ollama serve`
4. In application Settings, set Ollama endpoint URL (default: `http://localhost:11434`)
5. Select the local model from the dropdown

## Recommendation Summary

| Use Case | Best Choice | Runner-up |
|----------|------------|-----------|
| Best overall quality | Gemini 2.5 Pro | Claude 4 Sonnet |
| Budget cloud | Gemini 2.5 Flash (free tier) | GPT-4o-mini |
| Photo to 3D model | Gemini 2.5 Pro (vision) | GPT-4o (vision) |
| Complex parametric | Claude 4 Sonnet | Gemini 2.5 Pro |
| Privacy/offline | qwen2.5-coder:7b (Ollama) | deepseek-coder-v2:16b |
| Raspberry Pi local | qwen2.5-coder:7b (Q4) | mistral:7b (Q4) |
