import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'

const EFFORT_OPTIONS = ['S', 'M', 'L', 'XL']
const STATUS_OPTIONS = ['Idea', 'Design', 'Built', 'Discard']
const CATEGORY_OPTIONS = ['Operations', 'Real Estate', 'Happy Cuts', 'Homestead', 'Personal', 'Technical', 'Finance']

const VALUE_DESCRIPTIONS = [
  { stars: 1, label: 'Nice to have — low impact' },
  { stars: 2, label: 'Useful but not essential' },
  { stars: 3, label: 'Good to have — solid improvement' },
  { stars: 4, label: 'High impact — meaningful workflow change' },
  { stars: 5, label: 'Critical — solves major pain point' },
]

export default function BacklogModal({ isOpen, feature, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    effort: 'M',
    value: 3,
    category: 'Technical',
    description: '',
    status: 'Idea',
    buildPrompt: '',
  })

  useEffect(() => {
    if (feature) {
      setFormData({
        name: feature.fields['Feature'] || '',
        effort: feature.fields['Effort'] || 'M',
        value: feature.fields['Value'] || 3,
        category: feature.fields['Category'] || 'Technical',
        description: feature.fields['Description'] || '',
        status: feature.fields['Status'] || 'Idea',
        buildPrompt: feature.fields['Build Prompt'] || '',
      })
    } else {
      setFormData({
        name: '',
        effort: 'M',
        value: 3,
        category: 'Technical',
        description: '',
        status: 'Idea',
        buildPrompt: '',
      })
    }
  }, [feature, isOpen])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleValueClick = (stars) => {
    setFormData(prev => ({ ...prev, value: stars }))
  }

  const handleCopy = () => {
    const text = `Feature: ${formData.name}
Status: ${formData.status}
Effort: ${formData.effort}
Value: ${'⭐'.repeat(formData.value)}
Category: ${formData.category}

Description:
${formData.description || '(No description yet)'}

Build Prompt:
${formData.buildPrompt || '(No build prompt yet)'}`
    navigator.clipboard.writeText(text)
    toast.success('✓ Copied to clipboard')
  }

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error('Feature name is required')
      return
    }
    onSave(formData)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">{feature ? 'Edit Feature' : 'Add Feature'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">
          {/* Feature name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Feature Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Add bulk action feature"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Effort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Effort</label>
            <select
              name="effort"
              value={formData.effort}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {EFFORT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Value — interactive helper */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Value</label>
            <div className="space-y-2">
              {VALUE_DESCRIPTIONS.map(({ stars, label }) => (
                <button
                  key={stars}
                  onClick={() => handleValueClick(stars)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    formData.value === stars
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-medium">{('⭐'.repeat(stars))}</span> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="What does this feature do? Why is it useful?"
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Build Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Build Prompt (optional)</label>
            <textarea
              name="buildPrompt"
              value={formData.buildPrompt}
              onChange={handleChange}
              placeholder="Detailed instructions for building this feature..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Copy
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Feature
          </button>
        </div>
      </div>
    </div>
  )
}
