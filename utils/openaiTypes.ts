export type OpenAIChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: null | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

export type OpenAITool = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export type OpenAIChatCompletionChunk = {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: 'assistant'
      content?: string | Array<
        | { type: 'text'; text?: string }
        | { type: 'output_text'; text?: string }
        | { type: 'output_image'; image_url?: { url?: string }; image_base64?: string; mime_type?: string }
        | { type: 'image_url'; image_url?: { url?: string } }
      >
      tool_calls?: Array<{
        index: number
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason: null | 'stop' | 'length' | 'tool_calls'
  }>
}
