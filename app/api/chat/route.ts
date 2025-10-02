import { NextResponse, type NextRequest } from 'next/server'
import { OPENROUTER_API_BASE_URL } from '@/constant/urls'
import { handleError } from '../utils'
import { getRandomKey } from '@/utils/common'

export const runtime = 'edge'
export const preferredRegion = ['cle1', 'iad1', 'pdx1', 'sfo1', 'sin1', 'syd1', 'hnd1', 'kix1']

const openrouterApiKey = process.env.OPENROUTER_API_KEY as string
const openrouterApiBaseUrl = process.env.OPENROUTER_API_BASE_URL as string

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const apiKey = getRandomKey(openrouterApiKey, false)

  try {
    const url = `${openrouterApiBaseUrl || OPENROUTER_API_BASE_URL}/v1/chat/completions`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers.get('Content-Type') || 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers.get('referer') || 'http://localhost:3000',
        'X-Title': 'Gemini Next Chat',
      },
      body: rawBody,
    })
    return new NextResponse(response.body, response)
  } catch (error) {
    if (error instanceof Error) {
      return handleError(error.message)
    }
  }
}
