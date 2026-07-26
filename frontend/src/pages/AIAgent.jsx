import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Bot, User, Plus, ChevronDown, ChevronUp, Code2, DollarSign, Wrench, Zap } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import api from '../lib/api'
import clsx from 'clsx'

// ── tool call row ─────────────────────────────────────────────────────────────
function ToolCallRow({ tc, index }) {
  const [open, setOpen] = useState(false)
  let outputPreview = tc.output
  try {
    const parsed = JSON.parse(tc.output)
    outputPreview = JSON.stringify(parsed, null, 2)
  } catch {}

  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/3 transition-colors text-left"
      >
        <span className="text-amber-400 font-mono font-bold w-4 flex-shrink-0">{index + 1}</span>
        <span className="font-mono text-amber-300">{tc.tool_name}</span>
        <span className="text-gray-600 truncate">{JSON.stringify(tc.input)}</span>
        {tc.parallel && <span className="ml-auto text-gray-600 flex-shrink-0 flex items-center gap-0.5"><Zap size={9} className="text-amber-500/50" /> parallel</span>}
        {open ? <ChevronUp size={10} className="text-gray-600 flex-shrink-0" /> : <ChevronDown size={10} className="text-gray-600 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <p className="text-gray-600 mb-1">Input</p>
            <pre className="bg-black/30 rounded-lg p-2 text-gray-400 font-mono overflow-x-auto">
              {JSON.stringify(tc.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Output</p>
            <pre className="bg-black/30 rounded-lg p-2 text-emerald-400/80 font-mono overflow-x-auto max-h-48 overflow-y-auto">
              {outputPreview}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── message bubble ────────────────────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === 'user'
  const [showPrompt, setShowPrompt] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const meta = msg._meta  // attached client-side after API response

  return (
    <div className={clsx('flex gap-3 mb-5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={16} className="text-violet-400" />
        </div>
      )}

      <div className="flex flex-col gap-1.5" style={{ maxWidth: '75%' }}>
        <div className={clsx(
          'px-4 py-3 rounded-2xl text-sm leading-relaxed',
          isUser ? 'bg-violet-600 text-white rounded-tr-sm' : 'bg-gray-800 text-gray-200 rounded-tl-sm',
        )}>
          {isUser ? (
            <p>{msg.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none
              prose-p:my-1 prose-p:leading-relaxed
              prose-ul:my-1 prose-ul:pl-4
              prose-ol:my-1 prose-ol:pl-4
              prose-li:my-0.5
              prose-strong:text-white prose-strong:font-semibold
              prose-headings:text-gray-100 prose-headings:font-semibold prose-headings:text-sm prose-headings:mt-3 prose-headings:mb-1
              prose-code:text-violet-300 prose-code:bg-violet-500/15 prose-code:px-1 prose-code:rounded prose-code:text-xs
              prose-hr:border-gray-700">
              <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="w-full text-xs border-collapse">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-gray-700/50">{children}</thead>,
                tbody: ({ children }) => <tbody className="divide-y divide-gray-700/50">{children}</tbody>,
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left font-semibold text-gray-300 border-b border-gray-600 whitespace-nowrap">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{children}</td>
                ),
                tr: ({ children }) => <tr className="hover:bg-gray-700/20 transition-colors">{children}</tr>,
              }}
            >{msg.content}</ReactMarkdown>
            </div>
          )}
          <p className={clsx('text-xs mt-2', isUser ? 'text-violet-300' : 'text-gray-500')}>
            {msg.created_at
              ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'now'}
          </p>
        </div>

        {/* Meta strip — cost + tools + prompt */}
        {!isUser && meta && (
          <div className="flex flex-col gap-1.5">
            {/* Stats row */}
            <div className="flex items-center gap-2 px-1 flex-wrap">
              <DollarSign size={11} className="text-gray-600" />
              <span className="text-xs text-gray-500 tabular-nums font-mono">${meta.cost_usd.toFixed(6)}</span>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-gray-600 tabular-nums">{meta.input_tokens.toLocaleString()} in / {meta.output_tokens.toLocaleString()} out</span>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-gray-600">sonnet-4-6</span>

              <div className="ml-auto flex items-center gap-2">
                {meta.tool_calls?.length > 0 && (
                  <button
                    onClick={() => setShowTools(s => !s)}
                    className="flex items-center gap-1 text-xs text-gray-600 hover:text-amber-400 transition-colors"
                  >
                    <Wrench size={10} />
                    {meta.tool_calls.length} tool{meta.tool_calls.length > 1 ? 's' : ''}
                    {showTools ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                )}
                {meta.system_prompt && (
                  <button
                    onClick={() => setShowPrompt(s => !s)}
                    className="flex items-center gap-1 text-xs text-gray-600 hover:text-violet-400 transition-colors"
                  >
                    <Code2 size={10} />
                    Prompt
                    {showPrompt ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                )}
              </div>
            </div>

            {/* Tool calls panel */}
            {showTools && meta.tool_calls?.length > 0 && (
              <div className="bg-gray-900 border border-gray-700/60 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/60 bg-amber-500/5">
                  <Wrench size={11} className="text-amber-400" />
                  <span className="text-xs font-semibold text-gray-300">Tool Calls</span>
                  {meta.tool_calls.some(t => t.parallel) && (
                    <span className="ml-1 flex items-center gap-0.5 text-xs text-amber-400/70">
                      <Zap size={9} /> some ran in parallel
                    </span>
                  )}
                </div>
                <div className="divide-y divide-gray-700/40">
                  {meta.tool_calls.map((tc, i) => (
                    <ToolCallRow key={i} tc={tc} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* System prompt panel */}
            {showPrompt && meta.system_prompt && (
              <div className="bg-gray-900 border border-gray-700/60 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/60 bg-violet-500/5">
                  <div className="flex items-center gap-2">
                    <Code2 size={11} className="text-violet-400" />
                    <span className="text-xs font-semibold text-gray-300">System Prompt</span>
                  </div>
                  <span className="text-xs text-gray-600">{meta.input_tokens.toLocaleString()} input tokens total</span>
                </div>
                <pre className="text-xs text-gray-400 p-3 whitespace-pre-wrap leading-relaxed font-mono max-h-80 overflow-y-auto">
                  {meta.system_prompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={16} className="text-gray-400" />
        </div>
      )}
    </div>
  )
}

// ── suggestions ───────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'Summarize my finances',
  'What is my biggest spending category?',
  'What is my net cash flow this month?',
  'When will I reach my FIRE goal?',
]

// ── main page ─────────────────────────────────────────────────────────────────
export default function AIAgent() {
  const [activeConvId, setActiveConvId] = useState(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const bottomRef = useRef(null)
  const qc = useQueryClient()

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/ai/conversations/').then(r => r.data.results ?? r.data),
  })

  const { mutate: send, isPending } = useMutation({
    mutationFn: (message) => api.post('/ai/chat/', { message, conversation_id: activeConvId }),
    onSuccess: ({ data }) => {
      setActiveConvId(data.conversation_id)
      // Attach meta to the message so the bubble can render cost + prompt
      const msgWithMeta = { ...data.message, _meta: data.meta }
      setMessages(prev => [...prev, msgWithMeta])
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const loadConversation = async (id) => {
    setActiveConvId(id)
    const { data } = await api.get(`/ai/conversations/${id}/`)
    // History messages won't have meta (not stored in DB), that's fine
    setMessages(data.messages ?? [])
  }

  const newConversation = () => {
    setActiveConvId(null)
    setMessages([])
  }

  const handleSend = () => {
    if (!input.trim() || isPending) return
    const userMsg = { role: 'user', content: input, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    send(input)
    setInput('')
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Total session cost
  const sessionCost = messages.reduce((sum, m) => sum + (m._meta?.cost_usd ?? 0), 0)

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <div className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <button
            onClick={newConversation}
            className="flex items-center gap-2 w-full px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {(conversations ?? []).map(c => (
            <button
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors truncate',
                activeConvId === c.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
              )}
            >
              {c.title || 'Untitled'}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-800 bg-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <Bot size={18} className="text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">FinPulse AI Agent</p>
              <p className="text-xs text-gray-500">Knows your accounts, spending, loans & goals</p>
            </div>
          </div>
          {sessionCost > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg">
              <DollarSign size={11} />
              <span className="tabular-nums">Session cost: ${sessionCost.toFixed(5)}</span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className="w-16 h-16 rounded-2xl bg-violet-600/20 flex items-center justify-center">
                <Bot size={32} className="text-violet-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-white">How can I help?</p>
                <p className="text-sm text-gray-500 mt-1">Ask me anything about your financial data</p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-left px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-400 hover:border-violet-500/50 hover:text-gray-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => <Message key={i} msg={m} />)}
              {isPending && (
                <div className="flex gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                    <Bot size={16} className="text-violet-400" />
                  </div>
                  <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-tl-sm">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-800 bg-gray-900">
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ask about your finances… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 resize-none transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isPending}
              className="p-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
