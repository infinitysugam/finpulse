import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Bot, User, Plus, Trash2 } from 'lucide-react'
import api from '../lib/api'
import clsx from 'clsx'

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('flex gap-3 mb-4', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={16} className="text-violet-400" />
        </div>
      )}
      <div className={clsx(
        'max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
        isUser
          ? 'bg-violet-600 text-white rounded-tr-sm'
          : 'bg-gray-800 text-gray-200 rounded-tl-sm'
      )}>
        {msg.content}
        <p className={clsx('text-xs mt-1', isUser ? 'text-violet-300' : 'text-gray-500')}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={16} className="text-gray-400" />
        </div>
      )}
    </div>
  )
}

const SUGGESTIONS = [
  'Summarize my spending last month',
  'How much have I paid in interest this year?',
  'What is my net cash flow this month?',
  'When will I reach my millionaire goal?',
]

export default function AIAgent() {
  const [activeConvId, setActiveConvId] = useState(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const bottomRef = useRef(null)
  const qc = useQueryClient()

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/ai/conversations/').then((r) => r.data.results ?? r.data),
  })

  const { mutate: send, isPending } = useMutation({
    mutationFn: (message) =>
      api.post('/ai/chat/', { message, conversation_id: activeConvId }),
    onSuccess: ({ data }) => {
      setActiveConvId(data.conversation_id)
      setMessages((prev) => [...prev, data.message])
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const loadConversation = async (id) => {
    setActiveConvId(id)
    const { data } = await api.get(`/ai/conversations/${id}/`)
    setMessages(data.messages ?? [])
  }

  const newConversation = () => {
    setActiveConvId(null)
    setMessages([])
  }

  const handleSend = () => {
    if (!input.trim() || isPending) return
    const userMsg = { role: 'user', content: input, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    send(input)
    setInput('')
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex h-screen">
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
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors truncate',
                activeConvId === c.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              )}
            >
              {c.title || 'Untitled'}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center">
            <Bot size={18} className="text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">FinPulse AI Agent</p>
            <p className="text-xs text-gray-500">Ask anything about your finances</p>
          </div>
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
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s) }}
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
                      {[0, 1, 2].map((i) => (
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ask about your finances… (Enter to send)"
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
