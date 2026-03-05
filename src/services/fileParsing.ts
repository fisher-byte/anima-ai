/**
 * 文件解析服务
 * 支持本地解析 PDF, DOCX, TXT, Code 等文件
 * 所有解析都在本地完成，保护隐私
 */

// mammoth 和 PDF.js 均动态导入，避免打入主 bundle（各约 400KB）
let mammothLib: typeof import('mammoth') | null = null
async function getMammoth() {
  if (!mammothLib) mammothLib = await import('mammoth')
  return mammothLib
}

let pdfjsLib: any = null

export interface ParsedFile {
  name: string
  type: string
  size: number
  content: string
  preview?: string // 预览图（仅图片）
}

export interface FilePreview {
  id: string
  name: string
  type: 'image' | 'pdf' | 'doc' | 'text' | 'code'
  size: string
  status: 'pending' | 'reading' | 'done' | 'error'
  content?: string
  preview?: string
}

/**
 * 初始化 PDF.js
 */
async function initPdfJs() {
  if (!pdfjsLib) {
    const pdfjs = await import('pdfjs-dist')
    pdfjsLib = pdfjs
    // 设置 worker（使用 CDN 版本）
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
  }
  return pdfjsLib
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 获取文件类型分类
 */
export function getFileType(file: File): FilePreview['type'] {
  const type = file.type
  const name = file.name.toLowerCase()

  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    type === 'application/msword' ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  )
    return 'doc'
  if (
    name.endsWith('.js') ||
    name.endsWith('.ts') ||
    name.endsWith('.jsx') ||
    name.endsWith('.tsx') ||
    name.endsWith('.py') ||
    name.endsWith('.java') ||
    name.endsWith('.cpp') ||
    name.endsWith('.c') ||
    name.endsWith('.go') ||
    name.endsWith('.rs') ||
    name.endsWith('.swift') ||
    name.endsWith('.rb') ||
    name.endsWith('.php') ||
    name.endsWith('.html') ||
    name.endsWith('.css') ||
    name.endsWith('.json') ||
    name.endsWith('.xml') ||
    name.endsWith('.yaml') ||
    name.endsWith('.yml') ||
    name.endsWith('.sql') ||
    name.endsWith('.sh') ||
    name.endsWith('.bat')
  )
    return 'code'

  return 'text'
}

/**
 * 读取图片为 Base64
 */
export function readImageAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 解析 PDF 文件
 */
async function parsePDF(file: File): Promise<string> {
  const pdfjs = await initPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  const totalPages = pdf.numPages

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(' ')
    fullText += `\n--- Page ${i} ---\n${pageText}`
  }

  return fullText.trim()
}

/**
 * 解析 Word 文档
 */
async function parseWord(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const mammoth = await getMammoth()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

/**
 * 解析文本/代码文件
 */
function parseTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

/**
 * 解析单个文件
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const type = getFileType(file)
  let content = ''
  let preview: string | undefined

  try {
    switch (type) {
      case 'image':
        preview = await readImageAsBase64(file)
        // 图片不解析内容，只保留预览
        content = `[图片: ${file.name}]`
        break

      case 'pdf':
        content = await parsePDF(file)
        break

      case 'doc':
        content = await parseWord(file)
        break

      case 'code':
      case 'text':
        content = await parseTextFile(file)
        break

      default:
        content = await parseTextFile(file)
    }

    return {
      name: file.name,
      type: file.type,
      size: file.size,
      content,
      preview
    }
  } catch (error) {
    console.error(`解析文件 ${file.name} 失败:`, error)
    throw new Error(`无法解析文件 "${file.name}": ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 批量解析文件
 */
export async function parseFiles(files: File[]): Promise<ParsedFile[]> {
  const results: ParsedFile[] = []

  for (const file of files) {
    try {
      const parsed = await parseFile(file)
      results.push(parsed)
    } catch (error) {
      console.error(`跳过文件 ${file.name}:`, error)
      // 继续处理其他文件
    }
  }

  return results
}

/**
 * 将解析的文件内容格式化为 AI 可理解的格式
 */
export function formatFilesForAI(files: ParsedFile[]): string {
  if (files.length === 0) return ''

  const formatted = files.map((file, index) => {
    const header = `\n=== 文件 ${index + 1}: ${file.name} ===\n`
    const footer = `\n=== 结束 ${file.name} ===\n`

    // 限制内容长度，避免超出 token 限制
    const maxLength = 50000 // 每个文件最多 5 万字符
    const content = file.content.length > maxLength
      ? file.content.substring(0, maxLength) + '\n... [内容过长，已截断]'
      : file.content

    return header + content + footer
  }).join('\n')

  return `\n\n以下是我上传的文件内容，请分析并回答我的问题：\n${formatted}`
}
