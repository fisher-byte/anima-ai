export function extractJsonObject(raw: string): string | null {
  const sanitized = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  if (sanitized.startsWith('{') && sanitized.endsWith('}')) {
    return sanitized
  }

  const firstBrace = sanitized.indexOf('{')
  const lastBrace = sanitized.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }

  return sanitized.slice(firstBrace, lastBrace + 1)
}

export function parseJudgeJson<T>(raw: string): T {
  const extracted = extractJsonObject(raw)
  if (!extracted) {
    throw new Error('No JSON object found in evaluator output')
  }
  return JSON.parse(extracted) as T
}
