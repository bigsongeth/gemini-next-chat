import type { InlineDataPart, Tool } from '@xiangfa/generative-ai'
import { DefaultModel } from '@/constant/model'
import { OPENROUTER_API_BASE_URL } from '@/constant/urls'
import { hasUploadFiles } from '@/utils/common'
import type { OpenAIChatCompletionChunk, OpenAIChatCompletionMessage, OpenAITool } from '@/utils/openaiTypes'

export type RequestProps = {
  model?: string
  systemInstruction?: string
  tools?: Tool[]
  messages: Message[]
  apiKey: string
  baseUrl?: string
  generationConfig: {
    topP: number
    topK: number
    temperature: number
    maxOutputTokens: number
  }
  safety: string
}

const OPENROUTER_BASE_PATH = '/v1'

function resolveBaseUrl(baseUrl?: string) {
  const defaultBase = `${OPENROUTER_API_BASE_URL}${OPENROUTER_BASE_PATH}`
  if (!baseUrl) return defaultBase
  const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

  if (/(?:\/v\d+(?:beta)?\/openai|\/api\/v\d+|\/openai\/v\d+)$/.test(normalized)) {
    return normalized
  }

  if (normalized.endsWith('/chat/completions')) {
    return normalized.replace(/\/chat\/completions$/, '')
  }

  if (normalized.endsWith('/api')) {
    return `${normalized}/v1`
  }

  return `${normalized}${OPENROUTER_BASE_PATH}`
}

function buildOpenAITools(tools: Tool[] = []): OpenAITool[] | undefined {
  const declarations = tools.flatMap((tool) => tool.functionDeclarations ?? [])
  if (declarations.length === 0) return undefined
  return declarations.map((item) => ({
    type: 'function',
    function: {
      name: item.name,
      description: item.description,
      parameters: item.parameters ?? { type: 'object', properties: {} },
    },
  }))
}

function convertInlineData(part: InlineDataPart['inlineData']) {
  if (!part) return undefined
  return `data:${part.mimeType};base64,${part.data}`
}

function convertParts(parts: Message['parts']): OpenAIChatCompletionMessage['content'] {
  const contentParts: NonNullable<OpenAIChatCompletionMessage['content']> = []
  for (const part of parts) {
    if (part.text) {
      contentParts.push({ type: 'text', text: part.text })
    } else if (part.inlineData) {
      const dataUrl = convertInlineData(part.inlineData)
      if (dataUrl) {
        contentParts.push({ type: 'image_url', image_url: { url: dataUrl } })
      }
    }
  }
  return contentParts.length > 0 ? contentParts : null
}

function convertMessages(messages: Message[], systemInstruction?: string): OpenAIChatCompletionMessage[] {
  const results: OpenAIChatCompletionMessage[] = []
  if (systemInstruction) {
    results.push({ role: 'system', content: [{ type: 'text', text: systemInstruction }] })
  }
  for (const message of messages) {
    if (message.role === 'model') {
      const assistantMessage: OpenAIChatCompletionMessage = {
        role: 'assistant',
        content: [],
      }
      const toolCalls = []
      for (const part of message.parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.name,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          })
        } else if (part.text) {
          assistantMessage.content = assistantMessage.content ?? []
          assistantMessage.content.push({ type: 'text', text: part.text })
        } else if (part.inlineData) {
          assistantMessage.content = assistantMessage.content ?? []
          const dataUrl = convertInlineData(part.inlineData)
          if (dataUrl) {
            assistantMessage.content.push({ type: 'image_url', image_url: { url: dataUrl } })
          }
        }
      }
      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls
        assistantMessage.content = assistantMessage.content?.length ? assistantMessage.content : null
      }
      results.push(assistantMessage)
      continue
    }
    if (message.role === 'function') {
      for (const part of message.parts) {
        if (part.functionResponse) {
          results.push({
            role: 'tool',
            tool_call_id: part.functionResponse.name,
            content: [
              {
                type: 'text',
                text: JSON.stringify(part.functionResponse.response?.content ?? part.functionResponse.response ?? {}),
              },
            ],
          })
        }
      }
      continue
    }
    const role = message.role === 'model' ? 'assistant' : (message.role as OpenAIChatCompletionMessage['role'])
    const content = convertParts(message.parts)
    results.push({ role, content: content ?? [{ type: 'text', text: '' }] })
  }
  return results
}

function mapGenerationConfig(generationConfig: RequestProps['generationConfig']) {
  const { topP, temperature, maxOutputTokens } = generationConfig
  return {
    temperature,
    top_p: topP,
    max_output_tokens: maxOutputTokens,
  }
}

async function* parseChatCompletionsStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        yield JSON.parse(payload) as OpenAIChatCompletionChunk
      } catch (error) {
        // skip malformed chunk
      }
    }
  }
}

export default async function chat({
  messages = [],
  systemInstruction,
  tools,
  model = DefaultModel,
  apiKey,
  baseUrl,
  generationConfig,
}: RequestProps) {
  const url = `${resolveBaseUrl(baseUrl)}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
    headers['HTTP-Referer'] = 'http://localhost:3000'
    headers['X-Title'] = 'Gemini Next Chat'
  }
  const payload: Record<string, unknown> = {
    model,
    messages: convertMessages(messages, systemInstruction),
    stream: true,
    ...mapGenerationConfig(generationConfig),
  }
  if (hasUploadFiles(messages)) {
    payload.max_output_tokens = generationConfig.maxOutputTokens
  }
  const toolDeclarations = buildOpenAITools(tools)
  if (toolDeclarations) {
    payload.tools = toolDeclarations
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!response.ok || !response.body) {
    const error = await response.text()
    throw new Error(error || response.statusText)
  }
  return parseChatCompletionsStream(response.body.getReader())
}
